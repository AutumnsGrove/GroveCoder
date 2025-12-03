/**
 * GitHub API types for GroveCoder
 */

export interface RepoContext {
  owner: string;
  repo: string;
}

export interface PRContext extends RepoContext {
  prNumber: number;
  branch: string;
  baseBranch: string;
  headSha: string;
}

export interface FileContent {
  path: string;
  content: string;
  sha?: string;
  encoding?: 'utf-8' | 'base64';
}

export interface PRComment {
  id: number;
  body: string;
  user: {
    login: string;
    type: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface PRDetails {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  head: {
    ref: string;
    sha: string;
  };
  base: {
    ref: string;
    sha: string;
  };
  user: {
    login: string;
  };
  draft: boolean;
  mergeable: boolean | null;
  changedFiles: number;
  additions: number;
  deletions: number;
}

export interface PRDiff {
  filename: string;
  status: 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed' | 'unchanged';
  additions: number;
  deletions: number;
  patch?: string;
}

export interface DirectoryEntry {
  name: string;
  path: string;
  type: 'file' | 'dir' | 'submodule' | 'symlink';
  sha: string;
  size?: number;
}

export interface CreateFileOptions {
  message: string;
  content: string;
  branch?: string;
  sha?: string;
}
