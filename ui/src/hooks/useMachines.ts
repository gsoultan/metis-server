import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { MachineRole } from '../domain/machineJoins';
import { machineService } from '../services/domains/machineService';
import { useAppStore } from '../store/useAppStore';

const machinesKey = ['machines'] as const;
const joinsKey = ['machines', 'joins'] as const;

/** The machines running this server, asked again every 15 seconds, as often as each says it runs. */
export function useMachines() {
  const token = useAppStore((state) => state.token);
  return useQuery({
    queryKey: machinesKey,
    queryFn: ({ signal }) => machineService.list(signal),
    enabled: !!token,
    refetchInterval: 15_000,
  });
}

export function useForgetMachine() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => machineService.forget(id),
    onSuccess: () => void client.invalidateQueries({ queryKey: machinesKey }),
  });
}

/** The machines being added, asked again every 5 seconds: one that ran the command shows up quickly. */
export function useMachineJoins() {
  const token = useAppStore((state) => state.token);
  return useQuery({
    queryKey: joinsKey,
    queryFn: ({ signal }) => machineService.listJoins(signal),
    enabled: !!token,
    refetchInterval: 5_000,
  });
}

export function useMakeMachineJoin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (role: MachineRole) => machineService.makeJoin(role),
    onSuccess: () => void client.invalidateQueries({ queryKey: joinsKey }),
  });
}

export function useAcceptMachineJoin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => machineService.acceptJoin(id),
    onSuccess: () => void client.invalidateQueries({ queryKey: machinesKey }),
  });
}

export function useRemoveMachineJoin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => machineService.removeJoin(id),
    onSuccess: () => void client.invalidateQueries({ queryKey: joinsKey }),
  });
}
