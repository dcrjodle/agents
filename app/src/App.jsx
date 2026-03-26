import { useState, useEffect, useCallback, useRef } from "react";
import { useWorkflow } from "./hooks/useWorkflow.js";
import { CreateTask } from "./components/CreateTask.jsx";
import { TaskList } from "./components/TaskList.jsx";
import { ProjectTabs } from "./components/ProjectTabs.jsx";
import { PlanDialog } from "./components/PlanDialog.jsx";
import { StreamPanel } from "./components/StreamPanel.jsx";
import { ConnectionLines } from "./components/ConnectionLines.jsx";
import { SettingsDialog } from "./components/SettingsDialog.jsx";

const API_BASE = "/api";

export function App() {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [viewingPlanTaskId, setViewingPlanTaskId] = useState(null);
  const [columnsMode, setColumnsMode] = useState(false);
  const [taskRowRefs, setTaskRowRefs] = useState({});
  const [columnRefs, setColumnRefs] = useState({});
  const [showSettings, setShowSettings] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem("theme");
    return saved === "dark";
  });

  const mainAreaRef = useRef(null);
  const streamPanelRef = useRef(null);

  const {
    tasks,
    connected,
    agentLogs,
    pendingPlans,
    errors,
    createTask,
    startTask,
    restartTask,
    sendEvent,
    deleteTask,
    approveTask,
    clearPendingPlan,
  } = useWorkflow();

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", darkMode ? "dark" : "light");
    localStorage.setItem("theme", darkMode ? "dark" : "light");
  }, [darkMode]);

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

  const handleAddProject = useCallback(async (name, path) => {
    const res = await fetch(`${API_BASE}/config/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, path }),
    });
    if (!res.ok) return;
    const config = await res.json();
    const list = config.projects || [];
    setProjects(list);
    if (!selectedProject && list.length > 0) setSelectedProject(list[0]);
  }, [selectedProject]);

  const handleRemoveProject = useCallback(async (path) => {
    const res = await fetch(`${API_BASE}/config/projects`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    if (!res.ok) return;
    const config = await res.json();
    const list = config.projects || [];
    setProjects(list);
    if (selectedProject?.path === path) {
      setSelectedProject(list.length > 0 ? list[0] : null);
      setSelectedTaskId(null);
    }
  }, [selectedProject]);

  const handleRowRefs = useCallback((refs) => {
    setTaskRowRefs(refs);
  }, []);

  const handleColumnRefs = useCallback((refs) => {
    setColumnRefs(refs);
  }, []);

  const filteredTasks = selectedProject
    ? tasks.filter((t) => t.projectPath === selectedProject.path)
    : tasks;

  const selectedTask = selectedTaskId
    ? filteredTasks.find((t) => t.id === selectedTaskId)
    : null;

  useEffect(() => {
    if (selectedTaskId && !filteredTasks.find((t) => t.id === selectedTaskId)) {
      setSelectedTaskId(null);
    }
  }, [filteredTasks, selectedTaskId]);

  const viewingTask = viewingPlanTaskId ? tasks.find((t) => t.id === viewingPlanTaskId) : null;
  const viewingPlan = viewingPlanTaskId ? pendingPlans[viewingPlanTaskId] : null;

  return (
    <div style={{
      maxWidth: columnsMode && selectedTask ? "none" : 1100,
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
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h1 style={{
            margin: 0,
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: "0.02em",
            color: "var(--text)",
          }}>
            agent workflows
          </h1>
          <button
            onClick={() => setShowSettings(true)}
            title="settings"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 4,
              display: "flex",
              alignItems: "center",
              color: "var(--text-dim)",
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = "var(--text)"}
            onMouseLeave={(e) => e.currentTarget.style.color = "var(--text-dim)"}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
          </button>
        </div>
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

      {/* Main content: task list + connection lines + stream panel */}
      <div
        ref={mainAreaRef}
        style={{
          display: "flex",
          alignItems: "stretch",
          minHeight: 400,
          position: "relative",
          overflowX: columnsMode && selectedTask ? "auto" : "visible",
        }}
      >
        {/* SVG connection lines overlay */}
        <ConnectionLines
          containerRef={mainAreaRef}
          selectedTaskId={selectedTaskId}
          taskRowRefs={taskRowRefs}
          streamPanelRef={streamPanelRef}
          columnRefs={columnRefs}
          columnsMode={columnsMode}
        />

        {/* Task list */}
        <div style={{
          width: selectedTask ? 320 : "100%",
          maxWidth: selectedTask ? 320 : 600,
          transition: "width 0.3s ease, max-width 0.3s ease",
          flexShrink: 0,
          position: columnsMode && selectedTask ? "sticky" : "static",
          left: 0,
          zIndex: columnsMode && selectedTask ? 2 : "auto",
          background: "var(--bg)",
        }}>
          <TaskList
            tasks={filteredTasks}
            selectedTaskId={selectedTaskId}
            onSelectTask={setSelectedTaskId}
            onDelete={deleteTask}
            onStart={startTask}
            onRestart={restartTask}
            rowRefsCallback={handleRowRefs}
          />
        </div>

        {/* Gap for the line to cross */}
        {selectedTask && (
          <div style={{ width: 48, flexShrink: 0 }} />
        )}

        {/* Stream panel */}
        {selectedTask && (
          <StreamPanel
            ref={streamPanelRef}
            task={selectedTask}
            logs={agentLogs[selectedTaskId] || []}
            errors={errors[selectedTaskId] || []}
            pendingPlan={pendingPlans[selectedTaskId]}
            onSendEvent={sendEvent}
            onApprove={approveTask}
            onViewPlan={handleViewPlan}
            columnsMode={columnsMode}
            onToggleColumns={() => setColumnsMode((v) => !v)}
            columnRefsCallback={handleColumnRefs}
          />
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

      {showSettings && (
        <SettingsDialog
          darkMode={darkMode}
          onToggleDark={() => setDarkMode((v) => !v)}
          projects={projects}
          onAddProject={handleAddProject}
          onRemoveProject={handleRemoveProject}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
