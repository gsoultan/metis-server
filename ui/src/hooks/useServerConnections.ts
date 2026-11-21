import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { serverConnectionService } from '../services/domains/serverConnectionService';
import { useAppStore } from '../store/useAppStore';

export const serverConnectionKeys = {
  list: ['server-connections'] as const,
  deliveries: (projectId: string | null) => ['release-deliveries', projectId] as const,
};

/**
 * This server and the servers it is connected to. Only a platform
 * administrator may read them; for anybody else the query stays off.
 * Asked again every half minute, so a connection made on the other server
 * and its check-ins show up here without a reload.
 */
export function useServerConnections(enabled: boolean) {
  const token = useAppStore((state) => state.token);
  return useQuery({
    queryKey: serverConnectionKeys.list,
    queryFn: ({ signal }) => serverConnectionService.list(signal),
    enabled: !!token && enabled,
    refetchInterval: 30_000,
  });
}

/** Where the current project's releases were sent, as of each server's last check-in. */
export function useReleaseDeliveries() {
  const projectId = useAppStore((state) => state.currentProjectId);
  const token = useAppStore((state) => state.token);
  return useQuery({
    queryKey: serverConnectionKeys.deliveries(projectId),
    queryFn: ({ signal }) => serverConnectionService.deliveries(projectId ?? '', signal),
    enabled: !!token && !!projectId,
    refetchInterval: 30_000,
  });
}

/** Connecting, accepting, removing and checking in. Each refreshes the list. */
export function useServerConnectionActions() {
  const client = useQueryClient();
  const refresh = () => void client.invalidateQueries({ queryKey: serverConnectionKeys.list });
  return {
    makeCode: useMutation({ mutationFn: () => serverConnectionService.makeCode(), onSuccess: refresh }),
    connect: useMutation({
      mutationFn: (v: { url: string; code: string }) => serverConnectionService.connect(v.url, v.code),
      onSuccess: refresh,
    }),
    accept: useMutation({ mutationFn: (id: string) => serverConnectionService.accept(id), onSuccess: refresh }),
    remove: useMutation({ mutationFn: (id: string) => serverConnectionService.remove(id), onSuccess: refresh }),
    collectNow: useMutation({
      mutationFn: (id: string) => serverConnectionService.collectNow(id),
      onSuccess: () => {
        refresh();
        void client.invalidateQueries({ queryKey: ['releases'] });
      },
    }),
  };
}

/** Sending a release to a server after this one. */
export function useSendRelease() {
  const projectId = useAppStore((state) => state.currentProjectId) ?? '';
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: { release: string; connectionId: string }) =>
      serverConnectionService.send(projectId, v.release, v.connectionId),
    onSuccess: () => void client.invalidateQueries({ queryKey: serverConnectionKeys.deliveries(projectId) }),
  });
}
