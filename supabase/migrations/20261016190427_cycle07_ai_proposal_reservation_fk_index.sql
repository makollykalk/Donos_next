-- Cover the child-side composite FK used to bind proposals to usage reservations.
create index ai_text_proposals_usage_reservation_fk_idx
  on core.ai_text_proposals(
    organization_id,restaurant_id,usage_meter_key,operation_key,request_hash,usage_reservation_id
  );
