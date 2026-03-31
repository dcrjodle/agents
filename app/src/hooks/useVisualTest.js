import { useState, useEffect, useRef, useCallback } from "react";
import { stateKey } from "./useWorkflow.js";

/**
 * Frontend-only visual testing hook.
 * Communicates with the Vite dev server plugin via SSE + fetch.
 * No Express server contact.
 */
export function useVisualTest(tasks) {
  // Per-task visual test results: { [taskId]: { status, screenshotUrl?, markdownUrl?, error? } }
  const [results, setResults] = useState({});
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(null); // { taskId, step, message }
  const eventSourceRef = useRef(null);

  // Connect to SSE stream
  useEffect(() => {
    const es = new EventSource("/visual-test/events");

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case "VISUAL_TEST_STARTED":
            setIsRunning(true);
            setProgress({ message: `Testing ${data.taskCount} task(s)...` });
            break;

          case "VISUAL_TEST_PROGRESS":
            setProgress({ taskId: data.taskId, step: data.step, message: data.message });
            break;

          case "VISUAL_TEST_COMPLETE":
            setIsRunning(false);
            setProgress(null);
            if (data.results) {
              setResults((prev) => {
                const next = { ...prev };
                for (const r of data.results) {
                  next[r.taskId] = {
                    status: r.status,
                    screenshotUrl: r.screenshotUrl || null,
                    markdownUrl: r.markdownUrl || null,
                    error: r.error || null,
                    branchName: r.branchName,
                    timestamp: data.timestamp,
                  };
                }
                return next;
              });
            }
            break;

          case "VISUAL_TEST_CANCELLED":
            setIsRunning(false);
            setProgress(null);
            break;
        }
      } catch {}
    };

    es.onerror = () => {
      // SSE will auto-reconnect
    };

    eventSourceRef.current = es;
    return () => es.close();
  }, []);

  // Get eligible tasks (merging.awaitingApproval with a branch name)
  const getEligibleTasks = useCallback(() => {
    return tasks.filter((t) => {
      const sk = t.stateKey || stateKey(t.state);
      return sk === "merging.awaitingApproval" && (t.branchName || t.context?.result?.branchName || t.context?.branchName);
    });
  }, [tasks]);

  const triggerVisualTest = useCallback(async (projectPath) => {
    const eligible = getEligibleTasks().filter((t) => t.projectPath === projectPath);
    if (eligible.length === 0) throw new Error("No tasks ready for visual testing");

    const payload = eligible.map((t) => ({
      taskId: t.id,
      branchName: t.branchName || t.context?.result?.branchName || t.context?.branchName,
      description: t.description,
    }));

    const res = await fetch("/visual-test/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tasks: payload }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || "Failed to start visual test");
    }

    return res.json();
  }, [getEligibleTasks]);

  const cancelVisualTest = useCallback(async () => {
    await fetch("/visual-test/cancel", { method: "POST" });
  }, []);

  return {
    visualTestResults: results,
    visualTestIsRunning: isRunning,
    visualTestProgress: progress,
    triggerVisualTest,
    cancelVisualTest,
    getEligibleTasks,
  };
}
