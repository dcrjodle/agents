import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
import { buildTaskMenuItems } from "./utils/taskMenuItems.js";
import { EvaluatorCharacter } from "./components/EvaluatorCharacter.jsx";
import { VisualTestButton } from "./components/VisualTestButton.jsx";
import "./styles/layout.css";

const API_BASE = "/api";

export function App() {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [taskInputsByProject, setTaskInputsByProject] = useState({});
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [viewingPlanTaskId, setViewingPlanTaskId] = useState(null);
  const [viewMode, setViewMode] = useState("stream");
  const [showSettings, setShowSettings] = useState(false);
  const [projectSettingsTarget, setProjectSettingsTarget] = useState(null);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem("theme");
    return saved === "dark";
  });
  const approvedPlanIds = useRef(new Set());

  const {
    tasks,
    connected,
    agentLogs,
    pendingPlans,
    errors,
    agentMemory,
    avatarStates,
    evaluationResults,
    evaluatingProjects,
    triggerEvaluation,
    visualTestResults,
    visualTestingProjects,
    triggerVisualTest,
    createTask,
    startTask,
    startAllTasks,
    restartTask,
    continueTask,
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
    Object.keys(pendingPlans).forEach((taskId) => {
      if (approvedPlanIds.current.has(taskId)) return;
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;
      const project = projects.find((p) => p.path === task.projectPath);
      if (!project?.settings?.autoApprovePlans) return;
      approvedPlanIds.current.add(taskId);
      approveTask(taskId, "Auto-approved");
      clearPendingPlan(taskId);
    });
  }, [pendingPlans, tasks, projects, approveTask, clearPendingPlan]);

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
    setTaskInputsByProject((prev) => ({ ...prev, [selectedProject.path]: "" }));
  };

  const handleCreateAndStartTask = async (description) => {
    if (!selectedProject) return;
    try {
      await createTask(description, selectedProject.path, { autoStart: true });
      setTaskInputsByProject((prev) => ({ ...prev, [selectedProject.path]: "" }));
    } catch (err) {
      console.error("Failed to create and start task:", err);
    }
  };

  const handleTaskInputChange = useCallback((newValue) => {
    if (!selectedProject) return;
    setTaskInputsByProject((prev) => ({ ...prev, [selectedProject.path]: newValue }));
  }, [selectedProject]);

  const handleSelectProject = (project) => {
    setSelectedProject(project);
    setSelectedTaskId(null);
  };

  const handleViewPlan = useCallback((taskId) => {
    setViewingPlanTaskId(taskId);
  }, []);

  const handleApprovePlan = useCallback((reviewComments) => {
    if (viewingPlanTaskId) {
      approveTask(viewingPlanTaskId, "User approved plan", reviewComments);
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

  const patchProjectSetting = useCallback(async (key, value) => {
    if (!selectedProject) return;
    // Optimistic update
    const optimistic = { ...selectedProject, settings: { ...selectedProject.settings, [key]: value } };
    handleProjectSettingsUpdated(optimistic);
    try {
      const res = await fetch(`${API_BASE}/config/projects/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: selectedProject.path, settings: { [key]: value } }),
      });
      if (res.ok) {
        const updated = await res.json();
        handleProjectSettingsUpdated(updated);
      } else {
        // Revert on failure
        const config = await fetch(`${API_BASE}/config`).then((r) => r.json());
        const list = config.projects || [];
        setProjects(list);
        const fresh = list.find((p) => p.path === selectedProject.path);
        if (fresh) setSelectedProject(fresh);
      }
    } catch (err) {
      console.error("Failed to patch project setting:", err);
      const config = await fetch(`${API_BASE}/config`).then((r) => r.json());
      const list = config.projects || [];
      setProjects(list);
      const fresh = list.find((p) => p.path === selectedProject.path);
      if (fresh) setSelectedProject(fresh);
    }
  }, [selectedProject, handleProjectSettingsUpdated]);

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

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Skip when a modal/dialog is open
      if (viewingPlanTaskId || showSettings || projectSettingsTarget) return;
      // Skip when focus is inside an input or textarea
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      // Need at least one project
      if (projects.length === 0) return;

      // Cmd+1–9: jump to Nth tab
      if (e.metaKey && !e.altKey && e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        if (projects.length <= 1) return;
        const index = parseInt(e.key, 10) - 1;
        if (index < projects.length) {
          handleSelectProject(projects[index]);
        }
        return;
      }

      // Cmd+Option+ArrowLeft / Cmd+Option+ArrowRight: cycle tabs
      if (e.metaKey && e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        if (projects.length <= 1 || !selectedProject) return;
        const currentIndex = projects.findIndex((p) => p.path === selectedProject.path);
        if (currentIndex === -1) return;
        const nextIndex =
          e.key === "ArrowRight"
            ? (currentIndex + 1) % projects.length
            : (currentIndex - 1 + projects.length) % projects.length;
        handleSelectProject(projects[nextIndex]);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [projects, selectedProject, showSettings, viewingPlanTaskId, projectSettingsTarget]);

  const idleTasks = filteredTasks.filter((t) => {
    const sk = t.stateKey || stateKey(t.state);
    return sk === "idle";
  });

  const handleStartAll = () => {
    if (idleTasks.length === 0) return;
    startAllTasks(idleTasks.map((t) => t.id));
  };

  const handleApproveAllPlans = useCallback((reviewComments) => {
    const taskIds = Object.keys(pendingPlans);
    taskIds.forEach((taskId) => {
      approveTask(taskId, "User approved all plans", reviewComments);
      clearPendingPlan(taskId);
    });
    setViewingPlanTaskId(null);
  }, [pendingPlans, approveTask, clearPendingPlan]);

  const commands = useMemo(() => {
    // Global commands — always present
    const globalCommands = [
      {
        label: "run all",
        description: "start all idle tasks",
        action: () => handleStartAll(),
      },
      {
        label: "open settings",
        description: "open global settings",
        action: () => setShowSettings(true),
      },
      {
        label: "open project settings",
        description: "open settings for active project",
        action: () => setProjectSettingsTarget(selectedProject),
      },
    ];

    // Task commands — derived from context menu items for the selected task
    const taskCommands = [];
    if (selectedTask) {
      const descriptionMap = {
        "start": "start selected task",
        "view plan": "view plan for selected task",
        "approve pr": "approve pull request for selected task",
        "continue": "continue selected task from failure point",
        "restart": "restart selected task from scratch",
        "delete": "delete selected task",
      };
      const menuItems = buildTaskMenuItems(selectedTask, {
        onStart: startTask,
        onRestart: restartTask,
        onContinue: continueTask,
        onDelete: deleteTask,
        onViewPlan: handleViewPlan,
        onApprove: approveTask,
        pendingPlans,
        // onStartEditing not passed — "edit" requires TaskList's local inline-edit state
      });
      for (const item of menuItems) {
        if (item.separator) continue;
        taskCommands.push({
          label: item.label,
          description: descriptionMap[item.label] || item.label,
          action: item.action,
        });
      }
    }

    // Project settings commands — derived from the active project's settings
    const projectCommands = [];
    if (selectedProject?.settings) {
      const s = selectedProject.settings;

      // createPr boolean toggle
      projectCommands.push({
        label: s.createPr !== false ? "disable create pr" : "enable create pr",
        description: "toggle pull request creation",
        action: () => patchProjectSetting("createPr", s.createPr === false),
      });

      // autoApprovePlans boolean toggle
      projectCommands.push({
        label: s.autoApprovePlans ? "deactivate auto approve" : "activate auto approve",
        description: "toggle auto-approve mode for plans",
        action: () => patchProjectSetting("autoApprovePlans", !s.autoApprovePlans),
      });
    }

    return [...globalCommands, ...taskCommands, ...projectCommands];
  }, [
    selectedTask,
    selectedProject,
    pendingPlans,
    startTask,
    restartTask,
    continueTask,
    deleteTask,
    handleViewPlan,
    approveTask,
    patchProjectSetting,
    idleTasks,
  ]);

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
            tasks={tasks}
            pendingPlans={pendingPlans}
            onStart={startTask}
            onRestart={restartTask}
            onContinue={continueTask}
            onViewPlan={handleViewPlan}
            onApprove={approveTask}
            onSelectTask={setSelectedTaskId}
            onRemoveProject={handleRemoveProject}
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
            <CreateTask
              onCreate={handleCreateTask}
              onCreateAndStart={handleCreateAndStartTask}
              commands={commands}
              value={taskInputsByProject[selectedProject?.path] ?? ""}
              onValueChange={handleTaskInputChange}
            />
          )}
          <TaskList
            tasks={filteredTasks}
            selectedTaskId={selectedTaskId}
            onSelectTask={setSelectedTaskId}
            onDelete={deleteTask}
            onStart={startTask}
            onRestart={restartTask}
            onContinue={continueTask}
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
              agentMemory={agentMemory}
              avatarStates={avatarStates[selectedTaskId] || {}}
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
          onApproveAll={handleApproveAllPlans}
          pendingPlanCount={Object.keys(pendingPlans).length}
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

      {selectedProject && (
        <EvaluatorCharacter
          evaluationResult={evaluationResults[selectedProject.path]}
          isEvaluating={evaluatingProjects.has(selectedProject.path)}
          onEvaluate={() => triggerEvaluation(selectedProject.path).catch((err) => console.error("Evaluation error:", err))}
          onAddTask={handleCreateTask}
        />
      )}

      {selectedProject && (
        <div style={{ position: "fixed", bottom: 16, right: 16, zIndex: 40 }}>
          <VisualTestButton
            isRunning={visualTestingProjects.has(selectedProject.path)}
            results={visualTestResults[selectedProject.path]}
            onTrigger={() => triggerVisualTest(selectedProject.path).catch((err) => console.error("Visual test error:", err))}
            eligibleTaskCount={tasks.filter((t) => t.projectPath === selectedProject.path && (t.stateKey || stateKey(t.state)) === "merging.awaitingApproval").length}
          />
        </div>
      )}
    </div>
  );
}
