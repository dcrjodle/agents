import { useState, useEffect, useCallback } from "react";
import { useWorkflow } from "./hooks/useWorkflow.js";
import { CreateTask } from "./components/CreateTask.jsx";
import { TaskList } from "./components/TaskList.jsx";
import { ProjectTabs } from "./components/ProjectTabs.jsx";
import { PlanDialog } from "./components/PlanDialog.jsx";

const API_BASE = "/api";

export function App() {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [viewingPlanTaskId, setViewingPlanTaskId] = useState(null);
  const { tasks, connected, agentLogs, pendingPlans, errors, createTask, sendEvent, deleteTask, approveTask, clearPendingPlan } = useWorkflow();

  useEffect(() => {
    fetch(`${API_BASE}/config`)
      .then((res) => res.json())
      .then((config) => {
        const list = config.projects || [];
        setProjects(list);
        if (list.length > 0) setSelectedProject(list[0]);
      })
      .catch((err) => console.error("Failed to load config:", err));
  }, []);

  // Auto-open plan dialog when a pending plan arrives
  useEffect(() => {
    for (const taskId of Object.keys(pendingPlans)) {
      if (!viewingPlanTaskId) {
        setViewingPlanTaskId(taskId);
        break;
      }
    }
  }, [pendingPlans, viewingPlanTaskId]);

  const handleCreateTask = (description) => {
    if (!selectedProject) return;
    createTask(description, selectedProject.path);
  };

  const handleViewPlan = useCallback((taskId) => {
    setViewingPlanTaskId(taskId);
  }, []);

  const handleApprovePlan = useCallback(() => {
    if (viewingPlanTaskId) {
      approveTask(viewingPlanTaskId, "User approved plan");
      clearPendingPlan(viewingPlanTaskId);
      setViewingPlanTaskId(null);
    }
  }, [viewingPlanTaskId, approveTask, clearPendingPlan]);

  const handleRejectPlan = useCallback(() => {
    if (viewingPlanTaskId) {
      sendEvent(viewingPlanTaskId, { type: "PLAN_REJECTED" });
      clearPendingPlan(viewingPlanTaskId);
      setViewingPlanTaskId(null);
    }
  }, [viewingPlanTaskId, sendEvent, clearPendingPlan]);

  const handleClosePlan = useCallback(() => {
    setViewingPlanTaskId(null);
  }, []);

  const viewingTask = viewingPlanTaskId ? tasks.find((t) => t.id === viewingPlanTaskId) : null;
  const viewingPlan = viewingPlanTaskId ? pendingPlans[viewingPlanTaskId] : null;

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: 24, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Agent Workflows</h1>
        <span
          style={{
            fontSize: 12,
            color: connected ? "#22c55e" : "#ef4444",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: connected ? "#22c55e" : "#ef4444",
              display: "inline-block",
            }}
          />
          {connected ? "connected" : "disconnected"}
        </span>
      </header>

      {projects.length > 0 && selectedProject ? (
        <>
          <ProjectTabs projects={projects} selected={selectedProject} onSelect={setSelectedProject} />
          <CreateTask onCreate={handleCreateTask} />
        </>
      ) : (
        <p style={{ color: "#888" }}>Loading projects...</p>
      )}
      <TaskList
        tasks={tasks}
        agentLogs={agentLogs}
        pendingPlans={pendingPlans}
        errors={errors}
        onSendEvent={sendEvent}
        onDelete={deleteTask}
        onApprove={approveTask}
        onViewPlan={handleViewPlan}
      />

      {viewingPlan && (
        <PlanDialog
          plan={viewingPlan}
          taskDescription={viewingTask?.description || ""}
          onApprove={handleApprovePlan}
          onReject={handleRejectPlan}
          onClose={handleClosePlan}
        />
      )}
    </div>
  );
}
