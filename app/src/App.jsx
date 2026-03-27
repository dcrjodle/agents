import { useState, useEffect, useCallback } from "react";
import { Settings } from "lucide-react";
import { useWorkflow, stateKey } from "./hooks/useWorkflow.js";
import { CreateTask } from "./components/CreateTask.jsx";
import { TaskList } from "./components/TaskList.jsx";
import { ProjectTabs } from "./components/ProjectTabs.jsx";
import { PlanDialog } from "./components/PlanDialog.jsx";
import { DetailPanel } from "./components/DetailPanel.jsx";
import { SettingsDialog } from "./components/SettingsDialog.jsx";
import { ProjectSettingsDialog } from "./components/ProjectSettingsDialog.jsx";
import { IconButton } from "./components/IconButton.jsx";
import "./styles/layout.css";

const API_BASE = "/api";

export function App() {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [viewingPlanTaskId, setViewingPlanTaskId] = useState(null);
  const [viewMode, setViewMode] = useState("nodes");
  const [showSettings, setShowSettings] = useState(false);
  const [projectSettingsTarget, setProjectSettingsTarget] = useState(null);
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
    updateTask,
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

  const handleReorderProjects = useCallback(async (reordered) => {
    // Optimistic update
    setProjects(reordered);
    try {
      const res = await fetch(`${API_BASE}/config/projects/reorder`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projects: reordered }),
      });
      if (!res.ok) {
        // Revert on failure
        const config = await fetch(`${API_BASE}/config`).then((r) => r.json());
        setProjects(config.projects || []);
      }
    } catch (err) {
      console.error("Failed to reorder projects:", err);
      const config = await fetch(`${API_BASE}/config`).then((r) => r.json());
      setProjects(config.projects || []);
    }
  }, []);

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

  const handleProjectSettingsUpdated = useCallback((updatedProject) => {
    setProjects((prev) =>
      prev.map((p) => (p.path === updatedProject.path ? updatedProject : p))
    );
    if (selectedProject?.path === updatedProject.path) {
      setSelectedProject(updatedProject);
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
          <IconButton
            icon={Settings}
            onClick={() => setShowSettings(true)}
            title="settings"
            className="app-header-settings-btn"
          />
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
            onReorder={handleReorderProjects}
            onOpenSettings={setProjectSettingsTarget}
            onStartAll={handleStartAll}
            idleCount={idleTasks.length}
          />
        </>
      ) : (
        <p className="loading-text">loading projects...</p>
      )}

      {/* Main content: task list + detail panel */}
      <div className="main-content">
        {/* Task list - centered when no selection, slides left when detail open */}
        <div className={`task-list-container${selectedTask ? " shifted" : ""}`}>
          {projects.length > 0 && selectedProject && (
            <CreateTask onCreate={handleCreateTask} />
          )}
          <TaskList
            tasks={filteredTasks}
            selectedTaskId={selectedTaskId}
            onSelectTask={setSelectedTaskId}
            onDelete={deleteTask}
            onStart={startTask}
            onRestart={restartTask}
            onViewPlan={handleViewPlan}
            onApprove={approveTask}
            onEdit={(taskId, description) => updateTask(taskId, description).catch((err) => console.error("Failed to edit task:", err))}
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

      {projectSettingsTarget && (
        <ProjectSettingsDialog
          project={projectSettingsTarget}
          onClose={() => setProjectSettingsTarget(null)}
          onUpdated={handleProjectSettingsUpdated}
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
