export type LiquidSalePriceRule = {
  id: string;
  breath_type: 'mtl' | 'dtl';
  event_quantity: number;
  basic_quantity: number;
  sale_price: number;
};
