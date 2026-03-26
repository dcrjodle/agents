import { useState, useEffect, useCallback } from "react";
import { useWorkflow } from "./hooks/useWorkflow.js";
import { CreateTask } from "./components/CreateTask.jsx";
import { TaskList } from "./components/TaskList.jsx";
import { ProjectTabs } from "./components/ProjectTabs.jsx";
import { PlanDialog } from "./components/PlanDialog.jsx";
import { StreamPanel } from "./components/StreamPanel.jsx";
import { ConnectingLine } from "./components/ConnectingLine.jsx";

const API_BASE = "/api";

export function App() {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [viewingPlanTaskId, setViewingPlanTaskId] = useState(null);
  const {
    tasks,
    connected,
    agentLogs,
    pendingPlans,
    errors,
    createTask,
    sendEvent,
    deleteTask,
    approveTask,
    clearPendingPlan,
  } = useWorkflow();

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

  const handleSelectProject = (project) => {
    setSelectedProject(project);
    setSelectedTaskId(null);
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

  // Filter tasks by selected project
  const filteredTasks = selectedProject
    ? tasks.filter((t) => t.projectPath === selectedProject.path)
    : tasks;

  const selectedTask = selectedTaskId
    ? filteredTasks.find((t) => t.id === selectedTaskId)
    : null;

  // Clear selection if task no longer in filtered list
  useEffect(() => {
    if (selectedTaskId && !filteredTasks.find((t) => t.id === selectedTaskId)) {
      setSelectedTaskId(null);
    }
  }, [filteredTasks, selectedTaskId]);

  const viewingTask = viewingPlanTaskId ? tasks.find((t) => t.id === viewingPlanTaskId) : null;
  const viewingPlan = viewingPlanTaskId ? pendingPlans[viewingPlanTaskId] : null;

  return (
    <div style={{
      maxWidth: 1100,
      margin: "0 auto",
      padding: "24px 24px",
      fontFamily: "var(--font-mono)",
      minHeight: "100vh",
    }}>
      {/* Header */}
      <header style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 20,
      }}>
        <h1 style={{
          margin: 0,
          fontSize: 14,
          fontWeight: 600,
          letterSpacing: "0.02em",
          color: "var(--text)",
        }}>
          agent workflows
        </h1>
        <span style={{
          fontSize: 10,
          color: connected ? "var(--dot-done)" : "var(--dot-failed)",
          display: "flex",
          alignItems: "center",
          gap: 5,
        }}>
          <span style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: connected ? "var(--dot-done)" : "var(--dot-failed)",
            display: "inline-block",
          }} />
          {connected ? "connected" : "disconnected"}
        </span>
      </header>

      {projects.length > 0 && selectedProject ? (
        <>
          <ProjectTabs
            projects={projects}
            selected={selectedProject}
            onSelect={handleSelectProject}
          />
          <CreateTask onCreate={handleCreateTask} />
        </>
      ) : (
        <p style={{ color: "var(--text-dim)", fontSize: 12 }}>loading projects...</p>
      )}

      {/* Main content: task list + stream panel */}
      <div style={{
        display: "flex",
        alignItems: "stretch",
        minHeight: 400,
        transition: "all 0.25s ease",
      }}>
        {/* Task list */}
        <div style={{
          width: selectedTask ? 320 : "100%",
          maxWidth: selectedTask ? 320 : 600,
          transition: "all 0.25s ease",
          flexShrink: 0,
        }}>
          <TaskList
            tasks={filteredTasks}
            selectedTaskId={selectedTaskId}
            onSelectTask={setSelectedTaskId}
            onDelete={deleteTask}
          />
        </div>

        {/* Connecting line + Stream panel */}
        {selectedTask && (
          <>
            <ConnectingLine />
            <StreamPanel
              task={selectedTask}
              logs={agentLogs[selectedTaskId] || []}
              errors={errors[selectedTaskId] || []}
              pendingPlan={pendingPlans[selectedTaskId]}
              onSendEvent={sendEvent}
              onApprove={approveTask}
              onViewPlan={handleViewPlan}
            />
          </>
        )}
      </div>

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
