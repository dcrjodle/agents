import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Settings, LogOut, Rocket } from "lucide-react";
import { useWorkflow, stateKey } from "./hooks/useWorkflow.js";
import { CreateTask } from "./components/CreateTask.jsx";
import { TaskList } from "./components/TaskList.jsx";
import { ProjectTabs } from "./components/ProjectTabs.jsx";
import { PlanDialog } from "./components/PlanDialog.jsx";
import { ReviewDialog } from "./components/ReviewDialog.jsx";
import { PRApprovalDialog } from "./components/PRApprovalDialog.jsx";
import { DetailPanel } from "./components/DetailPanel.jsx";
import { SettingsDialog } from "./components/SettingsDialog.jsx";
import { ProjectSettingsDialog } from "./components/ProjectSettingsDialog.jsx";
import { IconButton } from "./components/IconButton.jsx";
import { buildTaskMenuItems } from "./utils/taskMenuItems.js";
import { ProjectToolbar } from "./components/ProjectToolbar.jsx";
import { LoginPage } from "./components/LoginPage.jsx";
import { ServerStatusPopover } from "./components/ServerStatusPopover.jsx";
import "./styles/layout.css";
import "./styles/login.css";
import "./styles/server-status.css";

import { API_BASE } from "./config.js";

export function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/auth/check`)
      .then((r) => r.json())
      .then((data) => {
        if (data.authenticated) setUser(data.email);
        setAuthChecked(true);
      })
      .catch(() => setAuthChecked(true));
  }, []);

  const handleLogout = async () => {
    await fetch(`${API_BASE}/logout`, { method: "POST" });
    setUser(null);
  };

  if (!authChecked) return null;
  if (!user) return <LoginPage onLogin={(email) => setUser(email)} />;

  return <AuthenticatedApp user={user} onLogout={handleLogout} />;
}

function AuthenticatedApp({ user, onLogout }) {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [taskInputsByProject, setTaskInputsByProject] = useState({});
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [viewingPlanTaskId, setViewingPlanTaskId] = useState(null);
  const [viewingReviewTaskId, setViewingReviewTaskId] = useState(null);
  const [viewingPrTaskId, setViewingPrTaskId] = useState(null);
  const [viewMode, setViewMode] = useState("stream");
  const [showSettings, setShowSettings] = useState(false);
  const [projectSettingsTarget, setProjectSettingsTarget] = useState(null);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem("theme");
    return saved === "dark";
  });
  const approvedPlanIds = useRef(new Set());
  const [deploying, setDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState(null);
  const [showServerStatus, setShowServerStatus] = useState(false);
  const [serverStatusAnchorRect, setServerStatusAnchorRect] = useState(null);
  const serverStatusHoverTimerRef = useRef(null);

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
    visualTestProgress,
    triggerVisualTest,
    createTask,
    startTask,
    startAllTasks,
    stopTask,
    restartTask,
    continueTask,
    sendEvent,
    deleteTask,
    approveTask,
    clearPendingPlan,
    pendingReviews,
    clearPendingReview,
    pendingPrs,
    clearPendingPr,
    reviewAction,
    prAction,
    planAction,
    updateTask,
    launchIvyStudio,
    ivyStudioRunningBranches,
    sendToGithubberQueue,
    deploy,
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

  const handleRevisePlan = useCallback((comments) => {
    if (viewingPlanTaskId) {
      planAction(viewingPlanTaskId, "revise", comments);
      clearPendingPlan(viewingPlanTaskId);
      setViewingPlanTaskId(null);
    }
  }, [viewingPlanTaskId, planAction, clearPendingPlan]);

  const handleClosePlan = useCallback(() => {
    setViewingPlanTaskId(null);
  }, []);

  const handleViewReview = useCallback((taskId) => {
    setViewingReviewTaskId(taskId);
  }, []);

  const handleApproveReview = useCallback(() => {
    if (viewingReviewTaskId) {
      reviewAction(viewingReviewTaskId, "approve");
      clearPendingReview(viewingReviewTaskId);
      setViewingReviewTaskId(null);
    }
  }, [viewingReviewTaskId, reviewAction, clearPendingReview]);

  const handleRequestChanges = useCallback((feedback) => {
    if (viewingReviewTaskId) {
      reviewAction(viewingReviewTaskId, "changes_requested", undefined, feedback);
      clearPendingReview(viewingReviewTaskId);
      setViewingReviewTaskId(null);
    }
  }, [viewingReviewTaskId, reviewAction, clearPendingReview]);

  const handleReviseReview = useCallback((reviewComments) => {
    if (viewingReviewTaskId) {
      reviewAction(viewingReviewTaskId, "revise", reviewComments);
      clearPendingReview(viewingReviewTaskId);
      setViewingReviewTaskId(null);
    }
  }, [viewingReviewTaskId, reviewAction, clearPendingReview]);

  const handleCloseReview = useCallback(() => {
    setViewingReviewTaskId(null);
  }, []);

  const handleViewPr = useCallback((taskId) => {
    setViewingPrTaskId(taskId);
  }, []);

  const handleApprovePr = useCallback(() => {
    if (viewingPrTaskId) {
      approveTask(viewingPrTaskId, "User approved PR");
      clearPendingPr(viewingPrTaskId);
      setViewingPrTaskId(null);
    }
  }, [viewingPrTaskId, approveTask, clearPendingPr]);

  const handlePrRequestChanges = useCallback((feedback) => {
    if (viewingPrTaskId) {
      prAction(viewingPrTaskId, "changes_requested", feedback);
      clearPendingPr(viewingPrTaskId);
      setViewingPrTaskId(null);
    }
  }, [viewingPrTaskId, prAction, clearPendingPr]);

  const handleClosePr = useCallback(() => {
    setViewingPrTaskId(null);
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
      if (viewingPlanTaskId || viewingReviewTaskId || viewingPrTaskId || showSettings || projectSettingsTarget) return;
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
  }, [projects, selectedProject, showSettings, viewingPlanTaskId, viewingReviewTaskId, viewingPrTaskId, projectSettingsTarget]);

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
        "stop": "stop running task",
        "view plan": "view plan for selected task",
        "approve pr": "approve pull request for selected task",
        "continue": "continue selected task from failure point",
        "restart": "restart selected task from scratch",
        "delete": "delete selected task",
      };
      const menuItems = buildTaskMenuItems(selectedTask, {
        onStart: startTask,
        onStop: stopTask,
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
        <div className="app-header-right">
          <span
            className={`app-connection-status server-status-trigger ${connected ? "connected" : "disconnected"}`}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setServerStatusAnchorRect(rect);
              setShowServerStatus((prev) => !prev);
            }}
            onMouseEnter={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              serverStatusHoverTimerRef.current = setTimeout(() => {
                setServerStatusAnchorRect(rect);
                setShowServerStatus(true);
              }, 300);
            }}
            onMouseLeave={() => {
              if (serverStatusHoverTimerRef.current) {
                clearTimeout(serverStatusHoverTimerRef.current);
                serverStatusHoverTimerRef.current = null;
              }
            }}
            title="Click to view server status"
          >
            <span className={`app-connection-dot ${connected ? "connected" : "disconnected"}`} />
            {connected ? "connected" : "disconnected"}
          </span>
          <IconButton
            icon={Rocket}
            onClick={async () => {
              if (deploying) return;
              setDeploying(true);
              setDeployResult(null);
              try {
                const result = await deploy();
                setDeployResult(result.success ? "deployed" : "failed");
              } catch {
                setDeployResult("failed");
              } finally {
                setDeploying(false);
                setTimeout(() => setDeployResult(null), 4000);
              }
            }}
            title={deploying ? "deploying..." : deployResult === "deployed" ? "deployed!" : deployResult === "failed" ? "deploy failed" : "deploy to production"}
            className="app-header-settings-btn"
            style={{
              opacity: deploying ? 0.5 : 1,
              color: deployResult === "deployed" ? "var(--accent-green, #22c55e)" : deployResult === "failed" ? "var(--accent-red, #ef4444)" : undefined,
            }}
          />
          <IconButton
            icon={LogOut}
            onClick={onLogout}
            title="logout"
            className="app-header-settings-btn"
          />
        </div>
      </header>

      {projects.length > 0 && selectedProject ? (
        <div className="project-tabs-row">
          <div className="project-tabs-scroller">
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
          </div>
          <ProjectToolbar
            evaluationResult={evaluationResults[selectedProject.path]}
            isEvaluating={evaluatingProjects.has(selectedProject.path)}
            onEvaluate={() => triggerEvaluation(selectedProject.path).catch((err) => console.error("Evaluation error:", err))}
            onAddTask={handleCreateTask}
            visualTestIsRunning={visualTestingProjects.has(selectedProject.path)}
            visualTestResults={visualTestResults[selectedProject.path]}
            visualTestProgress={visualTestProgress[selectedProject.path]}
            onVisualTest={() => triggerVisualTest(selectedProject.path).catch((err) => console.error("Visual test error:", err))}
            onSendToGithubber={(branches) => sendToGithubberQueue(selectedProject.path, branches).catch((err) => console.error("Githubber queue error:", err))}
            eligibleTaskCount={tasks.filter((t) => t.projectPath === selectedProject.path && (t.stateKey || stateKey(t.state)) === "merging.awaitingApproval").length}
            onLaunchStudio={launchIvyStudio}
            ivyStudioIsRunning={ivyStudioRunningBranches.size > 0}
          />
        </div>
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
            onStop={stopTask}
            onRestart={restartTask}
            onContinue={continueTask}
            onViewPlan={handleViewPlan}
            onViewReview={handleViewReview}
            onViewPr={handleViewPr}
            onApprove={approveTask}
            onEdit={(taskId, description) => updateTask(taskId, description).catch((err) => console.error("Failed to edit task:", err))}
            pendingPlans={pendingPlans}
            pendingReviews={pendingReviews}
            pendingPrs={pendingPrs}
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
          onRevise={handleRevisePlan}
          onClose={handleClosePlan}
          onApproveAll={handleApproveAllPlans}
          pendingPlanCount={Object.keys(pendingPlans).length}
        />
      )}

      {viewingReviewTaskId && pendingReviews[viewingReviewTaskId] && (
        <ReviewDialog
          review={pendingReviews[viewingReviewTaskId]}
          taskDescription={tasks.find((t) => t.id === viewingReviewTaskId)?.description || ""}
          onApprove={handleApproveReview}
          onRequestChanges={handleRequestChanges}
          onRevise={handleReviseReview}
          onClose={handleCloseReview}
        />
      )}

      {viewingPrTaskId && pendingPrs[viewingPrTaskId] && (
        <PRApprovalDialog
          pr={pendingPrs[viewingPrTaskId]}
          taskDescription={tasks.find((t) => t.id === viewingPrTaskId)?.description || ""}
          onApprove={handleApprovePr}
          onRequestChanges={handlePrRequestChanges}
          onClose={handleClosePr}
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

      {showServerStatus && serverStatusAnchorRect && (
        <ServerStatusPopover
          anchorRect={serverStatusAnchorRect}
          onClose={() => setShowServerStatus(false)}
        />
      )}

    </div>
  );
}
