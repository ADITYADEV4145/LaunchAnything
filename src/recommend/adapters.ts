export interface ProductHuntDates {
  openDates(date: string): Promise<{ dates: string[]; source: string }>;
}
export const offlineProductHunt: ProductHuntDates = {
  async openDates() { return { dates: [], source: 'unverified, check via PH MCP' }; },
};
