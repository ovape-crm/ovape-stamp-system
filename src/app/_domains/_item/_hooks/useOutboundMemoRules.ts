import { useQuery } from "@tanstack/react-query";
import {
  getOutboundMemoRules,
  outboundMemoRuleKey,
} from "../_services/outboundMemoRuleService";

export const useOutboundMemoRules = () => {
  const query = useQuery({
    queryKey: outboundMemoRuleKey,
    queryFn: getOutboundMemoRules,
    staleTime: 60_000,
    retry: false,
  });

  return {
    rules: query.data ?? [],
    isLoading: query.isPending,
    isError: query.isError,
  };
};
