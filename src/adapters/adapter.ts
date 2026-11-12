import type { Source, Capabilities, Candidate, EvidenceInput } from '../domain/types.js';
import type { CommentsInput, DiscoveryInput, SearchInput } from '../schemas/tools.js';
export interface RunContext { signal: AbortSignal; deadline: number; check(): void }
export type PostCandidate = Omit<EvidenceInput, 'platform' | 'source_id' | 'matched_keywords' | 'parent_id'> & { source_identity: string; parent_id?: string | null };
export type CandidateInput = Omit<Candidate, 'candidate_id' | 'job_id' | 'collected_at' | 'sequence'>;
export interface Adapter {
  probeSource(source: Source, context: RunContext): Promise<Capabilities>;
  discover(request: DiscoveryInput, context: RunContext): AsyncIterable<CandidateInput>;
  search(source: Source, request: SearchInput, context: RunContext): AsyncIterable<PostCandidate>;
  comments(source: Source, post: { record_id: string; url: string }, request: CommentsInput, context: RunContext): AsyncIterable<PostCandidate>;
  close(): Promise<void>;
}
