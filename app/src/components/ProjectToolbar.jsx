import { EvaluatorCharacter } from "./EvaluatorCharacter.jsx";
import { VisualTestButton } from "./VisualTestButton.jsx";
import { LaunchStudioButton } from "./LaunchStudioButton.jsx";
import "../styles/project-toolbar.css";

/**
 * ProjectToolbar — compact inline toolbar containing project tools.
 * Renders the EvaluatorCharacter (at compact scale), VisualTestButton,
 * and LaunchStudioButton side-by-side, intended to live at the right
 * end of the ProjectTabs row.
 */
export function ProjectToolbar({
  evaluationResult,
  isEvaluating,
  onEvaluate,
  onAddTask,
  visualTestIsRunning,
  visualTestResults,
  onVisualTest,
  eligibleTaskCount,
  onLaunchStudio,
}) {
  return (
    <div className="project-toolbar">
      <EvaluatorCharacter
        compact={true}
        evaluationResult={evaluationResult}
        isEvaluating={isEvaluating}
        onEvaluate={onEvaluate}
        onAddTask={onAddTask}
      />
      <div className="project-toolbar-separator" />
      <VisualTestButton
        isRunning={visualTestIsRunning}
        results={visualTestResults}
        onTrigger={onVisualTest}
        eligibleTaskCount={eligibleTaskCount}
      />
      <div className="project-toolbar-separator" />
      <LaunchStudioButton
        onLaunch={onLaunchStudio}
      />
    </div>
  );
}
