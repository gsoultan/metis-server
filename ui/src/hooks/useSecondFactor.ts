import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { secondFactorService } from '../services/domains/secondFactorService';
import { useAppStore } from '../store/useAppStore';

/** Whether the signed-in account signs in with an authenticator app. */
export const useSecondFactorStatus = () => {
  const userId = useAppStore((state) => state.user?.id ?? '');
  return useQuery({
    queryKey: ['second-factor', userId],
    queryFn: ({ signal }) => secondFactorService.secondFactorStatus(signal),
    enabled: !!userId,
  });
};

/** Replaces the signed-in account's recovery codes, given a code from the app. */
export const useRegenerateRecoveryCodes = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => secondFactorService.regenerateRecoveryCodes(code),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['second-factor'] });
    },
  });
};

/** Removes another account's authenticator app, as its administrator. */
export const useResetSecondFactor = () =>
  useMutation({ mutationFn: (userId: string) => secondFactorService.resetSecondFactor(userId) });
