export const RECRUITING_SCOPE_QUERIES = Symbol("RECRUITING_SCOPE_QUERIES");

export interface RecruitingScopeQueries {
  visibleCreatorIds(
    organizationId: string,
    actorId: string,
    memberRole: string,
  ): Promise<string[] | null>;
}
