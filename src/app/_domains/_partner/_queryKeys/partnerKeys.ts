export const partnerKeys = {
  all: () => ['partners'] as const,
  lists: () => [...partnerKeys.all(), 'list'] as const,
};
