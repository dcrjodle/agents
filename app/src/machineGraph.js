/**
 * Static graph data for the workflow state machine.
 * Keep in sync with machine.js at the repo root if transitions change.
 *
 * Layout (SVG coordinate space, 1900×520):
 *  Main pipeline row: cy=240
 *  merging fork (top): cy=155
 *  testing / directMerging fork (bottom): cy=375
 *  failed (below pipeline): cy=460
 */

// ── Compound-state container definitions ────────────────────────────────────

const PLANNING_CONTAINER    = { x: 155,  y: 130, w: 210, h: 175 };
const MERGING_CONTAINER     = { x: 1450, y: 90,  w: 275, h: 130 };

// ── Node list ────────────────────────────────────────────────────────────────
// Each node: { id, label, type, cx, cy, w, h }  (atomic)
//         or { id, label, type, x, y, w, h, children }  (compound)
// Children of compound nodes also have cx, cy, w, h (within the container).

export const MACHINE_NODES = [
  // ── Atomic: idle ──
  { id: 'idle', label: 'idle', type: 'atomic', cx: 80,   cy: 240, w: 80,  h: 34 },

  // ── Compound: planning ──
  {
    id: 'planning', label: 'planning', type: 'compound',
    ...PLANNING_CONTAINER,
    children: [
      { id: 'planning.running',          label: 'running',          type: 'atomic', cx: 260, cy: 193, w: 150, h: 34 },
      { id: 'planning.awaitingApproval', label: 'await plan',        type: 'atomic', cx: 260, cy: 261, w: 168, h: 34 },
    ],
  },

  // ── Atomic: branching, developing, committing ──
  { id: 'branching',  label: 'branching',  type: 'atomic', cx: 430, cy: 240, w: 100, h: 34 },
  { id: 'developing', label: 'developing', type: 'atomic', cx: 548, cy: 240, w: 110, h: 34 },
  { id: 'committing', label: 'committing', type: 'atomic', cx: 665, cy: 240, w: 110, h: 34 },

  // ── Atomic: testing ──
  { id: 'testing', label: 'testing', type: 'atomic', cx: 830,  cy: 240, w: 90,  h: 34 },

  // ── Atomic: reviewing, pushing ──
  { id: 'reviewing', label: 'reviewing', type: 'atomic', cx: 1215, cy: 240, w: 100, h: 34 },
  { id: 'pushing',   label: 'pushing',   type: 'atomic', cx: 1340, cy: 240, w: 90,  h: 34 },

  // ── Compound: merging (top fork) ──
  {
    id: 'merging', label: 'merging', type: 'compound',
    ...MERGING_CONTAINER,
    children: [
      { id: 'merging.awaitingApproval', label: 'await PR',       type: 'atomic', cx: 1527, cy: 155, w: 130, h: 34 },
      { id: 'merging.creatingPr',       label: 'creating PR',    type: 'atomic', cx: 1662, cy: 155, w: 110, h: 34 },
    ],
  },

  // ── Atomic: directMerging (bottom fork) ──
  { id: 'directMerging', label: 'direct merging', type: 'atomic', cx: 1585, cy: 375, w: 128, h: 34 },

  // ── Atomic: done, failed ──
  { id: 'done',   label: 'done',   type: 'atomic', cx: 1820, cy: 240, w: 75,  h: 34 },
  { id: 'failed', label: 'failed', type: 'atomic', cx: 665,  cy: 460, w: 80,  h: 34 },
];

// ── Edge list ────────────────────────────────────────────────────────────────
// Each edge: { from, to, label, type }
// type: 'main' | 'guard' | 'failure' | 'retry'

export const MACHINE_EDGES = [
  // ── Happy path ──
  { from: 'idle',                        to: 'planning.running',          label: 'START',                         type: 'main'    },
  { from: 'planning.running',            to: 'planning.awaitingApproval', label: 'PLAN_READY',                    type: 'main'    },
  { from: 'planning.awaitingApproval',   to: 'branching',                 label: 'PLAN_APPROVED',                 type: 'main'    },
  { from: 'branching',                   to: 'developing',                label: 'BRANCH_READY',                  type: 'main'    },
  { from: 'developing',                  to: 'committing',                label: 'CODE_COMPLETE',                 type: 'main'    },
  { from: 'committing',                  to: 'testing',                   label: 'COMMIT_COMPLETE',               type: 'main'    },
  { from: 'testing',                     to: 'reviewing',                 label: 'TESTS_PASSED',                  type: 'main'    },
  { from: 'reviewing',                   to: 'pushing',                   label: 'REVIEW_APPROVED',               type: 'main'    },
  { from: 'pushing',                     to: 'merging.awaitingApproval',  label: 'PUSH_COMPLETE',                 type: 'main'    },
  { from: 'pushing',                     to: 'directMerging',             label: 'PUSH_COMPLETE_NO_PR',           type: 'main'    },
  { from: 'merging.awaitingApproval',    to: 'merging.creatingPr',        label: 'PR_APPROVED',                   type: 'main'    },
  { from: 'merging.creatingPr',          to: 'done',                      label: 'MERGED',                        type: 'main'    },
  { from: 'directMerging',               to: 'done',                      label: 'DIRECT_MERGE_COMPLETE',         type: 'main'    },

  // ── Failure edges ──
  { from: 'planning.running',          to: 'failed', label: 'PLAN_FAILED',                    type: 'failure' },
  { from: 'planning.awaitingApproval', to: 'failed', label: 'PLAN_REJECTED',                  type: 'failure' },
  { from: 'branching',                 to: 'failed', label: 'BRANCH_FAILED',                  type: 'failure' },
  { from: 'developing',                to: 'failed', label: 'CODE_FAILED',                    type: 'failure' },
  { from: 'committing',                to: 'failed', label: 'COMMIT_FAILED',                  type: 'failure' },
  { from: 'testing',                   to: 'failed', label: 'TESTS_FAILED (max retries)',     type: 'failure' },
  { from: 'reviewing',                 to: 'failed', label: 'CHANGES_REQUESTED (max retries)',type: 'failure' },
  { from: 'pushing',                   to: 'failed', label: 'PUSH_FAILED',                    type: 'failure' },
  { from: 'merging.creatingPr',        to: 'failed', label: 'PR_FAILED',                      type: 'failure' },
  { from: 'directMerging',             to: 'failed', label: 'DIRECT_MERGE_FAILED',            type: 'failure' },

  // ── Retry edges (backward) ──
  { from: 'testing',               to: 'developing',      label: 'TESTS_FAILED [retry]',             type: 'retry' },
  { from: 'reviewing',             to: 'developing',      label: 'CHANGES_REQUESTED [retry]',        type: 'retry' },
  { from: 'failed',                to: 'planning.running',label: 'RETRY [underRetryLimit]',           type: 'retry' },
];
