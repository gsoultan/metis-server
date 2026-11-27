import { useMutation, useQueryClient } from '@tanstack/react-query';

import { addExamples, type AddExamplesOptions, type ExampleApi } from '../domain/examples/install';
import { processService } from '../services/api';
import { participantService } from '../services/domains/participantService';
import { raiseIfRefused } from '../services/raise';
import { useAppStore } from '../store/useAppStore';

/** The newest version's id, preferring the live one. */
function pick(versions: ReadonlyArray<{ id: string; version: number; live: boolean }>): string | null {
  if (versions.length === 0) return null;
  const live = versions.find((v) => v.live);
  if (live) return live.id;
  return [...versions].sort((a, b) => b.version - a.version)[0].id;
}

function exampleApi(projectId: string, organizationId: string, userId: string): ExampleApi {
  return {
    findDecision: async (key) => pick(await processService.listDecisionVersions(projectId, key)),
    createDecision: async (decision) =>
      (await processService.createDecision({ ...decision, project: { id: projectId } })).id,
    findProcess: async (key) =>
      pick(raiseIfRefused(await processService.listDefinitionVersions(projectId, key)).versions),
    createProcess: async (process) => (await processService.createDefinition(projectId, process)).id,
    listGroups: async () => (await processService.listGroups(organizationId)).groups,
    createGroup: async (group) => {
      const { group: created } = await processService.createGroup({ ...group, organization_id: organizationId });
      if (created?.id) return created.id;
      // The server answers a create with the group on newer versions only.
      const found = (await processService.listGroups(organizationId)).groups.find((g) => g.name === group.name);
      if (!found) throw new Error(`the group ${group.name} was not created`);
      return found.id;
    },
    myGroups: async () => (await processService.listUserGroups(userId)).groups.map((g) => g.id),
    joinGroup: async (groupId) => {
      await processService.addMembership(groupId, userId);
    },
    addGroupsToPeople: async (names) => {
      await participantService.fillDirectoryGaps(projectId, [], names);
    },
  };
}

/** Adds the worked examples to the current project. */
export function useAddExamples() {
  const queryClient = useQueryClient();
  const projectId = useAppStore((state) => state.currentProjectId);
  const organizationId = useAppStore((state) => state.currentOrganizationId);
  const userId = useAppStore((state) => state.user?.id);
  return useMutation({
    mutationFn: (options: AddExamplesOptions) => {
      if (!projectId) return Promise.reject(new Error('Choose a project first.'));
      // Without an organization or an account the groups cannot be set up,
      // and the examples are still worth adding.
      const joinGroups = options.joinGroups && !!organizationId && !!userId;
      return addExamples(exampleApi(projectId, organizationId ?? '', userId ?? ''), { joinGroups });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['definitions', projectId] });
      void queryClient.invalidateQueries({ queryKey: ['liveVersions', projectId] });
      void queryClient.invalidateQueries({ queryKey: ['decisions'] });
      void queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });
}
