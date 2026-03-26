import { useState, useEffect, useCallback } from "react";
import { useWorkflow, stateKey } from "./hooks/useWorkflow.js";
import { CreateTask } from "./components/CreateTask.jsx";
import { TaskList } from "./components/TaskList.jsx";
import { ProjectTabs } from "./components/ProjectTabs.jsx";
import { PlanDialog } from "./components/PlanDialog.jsx";
import { DetailPanel } from "./components/DetailPanel.jsx";
import { SettingsDialog } from "./components/SettingsDialog.jsx";
import "./styles/layout.css";

const API_BASE = "/api";

export function App() {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [viewingPlanTaskId, setViewingPlanTaskId] = useState(null);
  const [viewMode, setViewMode] = useState("nodes");
  const [showSettings, setShowSettings] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem("theme");
    return saved === "dark";
  });

  const {
    tasks,
    connected,
    agentLogs,
    pendingPlans,
    errors,
    createTask,
    startTask,
    startAllTasks,
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

  const handleCloseDetail = useCallback(() => {
    setSelectedTaskId(null);
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

  const idleTasks = filteredTasks.filter((t) => {
    const sk = t.stateKey || stateKey(t.state);
    return sk === "idle";
  });

  const handleStartAll = () => {
    if (idleTasks.length === 0) return;
    startAllTasks(idleTasks.map((t) => t.id));
  };

  const viewingTask = viewingPlanTaskId ? tasks.find((t) => t.id === viewingPlanTaskId) : null;
  const viewingPlan = viewingPlanTaskId ? pendingPlans[viewingPlanTaskId] : null;

  return (
    <div className="app-root">
      {/* Header */}
      <header className="app-header">
        <div className="app-header-left">
          <h1 className="app-header-title">agent workflows</h1>
          <button
            className="app-header-settings-btn app-header-start-all-btn"
            onClick={handleStartAll}
            disabled={idleTasks.length === 0}
            title={idleTasks.length > 0 ? `Start all ${idleTasks.length} idle tasks` : "No idle tasks"}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="5,3 19,12 5,21" />
            </svg>
          </button>
          <button
            className="app-header-settings-btn"
            onClick={() => setShowSettings(true)}
            title="settings"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
          </button>
        </div>
        <span className={`app-connection-status ${connected ? "connected" : "disconnected"}`}>
          <span className={`app-connection-dot ${connected ? "connected" : "disconnected"}`} />
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
        <p className="loading-text">loading projects...</p>
      )}

      {/* Main content: task list + detail panel */}
      <div className="main-content">
        {/* Task list - centered when no selection, slides left when detail open */}
        <div className={`task-list-container${selectedTask ? " shifted" : ""}`}>
          <TaskList
            tasks={filteredTasks}
            selectedTaskId={selectedTaskId}
            onSelectTask={setSelectedTaskId}
            onDelete={deleteTask}
            onStart={startTask}
            onRestart={restartTask}
            onViewPlan={handleViewPlan}
            onApprove={approveTask}
            pendingPlans={pendingPlans}
          />
        </div>

        {/* Detail panel - appears when a task is selected */}
        {selectedTask && (
          <div className="detail-panel-container">
            <DetailPanel
              task={selectedTask}
              logs={agentLogs[selectedTaskId] || []}
              errors={errors[selectedTaskId] || []}
              pendingPlan={pendingPlans[selectedTaskId]}
              onSendEvent={sendEvent}
              onApprove={approveTask}
              onViewPlan={handleViewPlan}
              onClose={handleCloseDetail}
              viewMode={viewMode}
              onToggleViewMode={setViewMode}
            />
          </div>
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
