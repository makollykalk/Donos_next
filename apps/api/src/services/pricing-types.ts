import type { VerifiedActor } from '@donos/db';
import type {
  CatalogQuery, ContextSelection, CreatePricingChannelInput, CreatePricingComboInput,
  CreatePricingProductInput, CreatePricingSimulationInput, CreatePricingVariantInput,
  Page, PricingChannelProfile, PricingCombo, PricingProduct, PricingSimulation,
  PricingVariant, PricingVariantComboDetails, UpdatePricingChannelInput, UpdatePricingComboInput,
  UpdatePricingProductInput, UpdatePricingVariantInput,
} from '@donos/contracts';

type Args = [actor: VerifiedActor, selection: ContextSelection, contextToken: string];
export interface PricingService {
  createProduct(...args: [...Args, input: CreatePricingProductInput, key: string]): Promise<PricingProduct>;
  updateProduct(...args: [...Args, id: string, input: UpdatePricingProductInput, key: string]): Promise<PricingProduct>;
  listProducts(...args: [...Args, query: CatalogQuery]): Promise<Page<PricingProduct>>;
  createVariant(...args: [...Args, productId: string, input: CreatePricingVariantInput, key: string]): Promise<PricingVariant>;
  getVariant(...args: [...Args, id: string]): Promise<PricingVariantComboDetails>;
  updateVariant(...args: [...Args, id: string, input: UpdatePricingVariantInput, key: string]): Promise<PricingVariant>;
  createChannelProfile(...args: [...Args, input: CreatePricingChannelInput, key: string]): Promise<PricingChannelProfile>;
  updateChannelProfile(...args: [...Args, id: string, input: UpdatePricingChannelInput, key: string]): Promise<PricingChannelProfile>;
  listChannels(...args: [...Args, query: CatalogQuery]): Promise<Page<PricingChannelProfile>>;
  createCombo(...args: [...Args, input: CreatePricingComboInput, key: string]): Promise<PricingCombo>;
  updateCombo(...args: [...Args, id: string, input: UpdatePricingComboInput, key: string]): Promise<PricingCombo>;
  listCombos(...args: [...Args, query: CatalogQuery]): Promise<Page<PricingCombo>>;
  simulate(...args: [...Args, input: CreatePricingSimulationInput, key: string]): Promise<PricingSimulation>;
  listSimulations(...args: [...Args, productId: string, query: CatalogQuery]): Promise<Page<PricingSimulation>>;
  getSimulation(...args: [...Args, id: string]): Promise<PricingSimulation>;
}
