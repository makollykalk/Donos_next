import { FeatureKeySchema } from '@donos/contracts';
import type { Capability,FeatureKey } from '@donos/contracts';
import { DomainError } from '@donos/db';
import type { OrganizationContext,Tx } from '@donos/db';
export async function listCapabilities(ctx:OrganizationContext,tx:Tx):Promise<Capability[]> {
  const rows=(await tx.query('select feature_key,enabled,valid_from<=now() and now()<valid_until as valid,exists(select 1 from core.subscriptions s where s.organization_id=e.organization_id and s.status=\'active\' and s.starts_at<=now() and now()<s.ends_at) as subscribed from core.entitlements e where organization_id=$1',[ctx.organizationId])).rows;
  function base(feature:FeatureKey):Capability {
    const row=rows.find(r=>r.feature_key===feature);
    const reason=!row||!row.enabled||!row.subscribed ? 'NOT_GRANTED' : !row.valid ? 'EXPIRED':'ACTIVE';
    return {feature,allowed:reason==='ACTIVE',reason};
  }
  const inventory=base('inventory_core').allowed;
  return FeatureKeySchema.options.map(feature=>{
    const cap=base(feature);
    if(cap.allowed&&!inventory&&feature!=='inventory_core'&&feature!=='pricing_core') return {feature,allowed:false,reason:'BASE_REQUIRED'};
    return cap;
  });
}
export async function requireEntitlement(ctx:OrganizationContext,feature:FeatureKey,tx:Tx):Promise<void> {
  if(!(await listCapabilities(ctx,tx)).some(c=>c.feature===feature&&c.allowed)) throw new DomainError('ENTITLEMENT_REQUIRED',403);
}
