export const manualHelpKeys = {
  all: ['manual-help-bindings'] as const,
  binding: (locationKey: string) =>
    [...manualHelpKeys.all, 'binding', locationKey] as const,
  page: (pagePath: string) =>
    [...manualHelpKeys.all, 'page', pagePath] as const,
  options: (keyword: string) =>
    [...manualHelpKeys.all, 'options', keyword] as const,
};
