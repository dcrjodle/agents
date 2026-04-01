import { useState, useCallback } from "react";
import { EvaluatorCharacter } from "./EvaluatorCharacter.jsx";
import { VisualTestButton } from "./VisualTestButton.jsx";
import { LaunchStudioButton } from "./LaunchStudioButton.jsx";
import { AnaCharacter } from "./AnaCharacter.jsx";
import { AnaChatPanel } from "./AnaChatPanel.jsx";
import { useAnaChat } from "../hooks/useAnaChat.js";
import "../styles/project-toolbar.css";

/**
 * ProjectToolbar — compact inline toolbar containing project tools.
 * Renders the EvaluatorCharacter (at compact scale), VisualTestButton,
 * LaunchStudioButton, and AnaCharacter side-by-side, intended to live
 * at the right end of the ProjectTabs row.
 */
export function ProjectToolbar({
  evaluationResult,
  isEvaluating,
  onEvaluate,
  onAddTask,
  visualTestIsRunning,
  visualTestResults,
  visualTestProgress,
  onVisualTest,
  onStopVisualTest,
  onSendToGithubber,
  eligibleTaskCount,
  onLaunchStudio,
  ivyStudioIsRunning,
  projectPath,
  selectedTaskId,
}) {
  const [showAnaChat, setShowAnaChat] = useState(false);
  const {
    messages,
    sendMessage,
    isLoading: anaIsLoading,
    error: anaError,
    streamingContent,
    clearError: clearAnaError,
    clearMessages: clearAnaMessages,
  } = useAnaChat({ projectPath, selectedTaskId });

  const handleAnaClick = useCallback(() => {
    setShowAnaChat((prev) => !prev);
  }, []);

  const handleCloseChatPanel = useCallback(() => {
    setShowAnaChat(false);
  }, []);

  const handleSendMessage = useCallback((text) => {
    sendMessage(text);
  }, [sendMessage]);

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
        progress={visualTestProgress}
        onTrigger={onVisualTest}
        onSendToGithubber={onSendToGithubber}
        onStop={onStopVisualTest}
        eligibleTaskCount={eligibleTaskCount}
      />
      <div className="project-toolbar-separator" />
      <LaunchStudioButton
        onLaunch={onLaunchStudio}
        isRunning={ivyStudioIsRunning}
      />
      <div className="project-toolbar-separator project-toolbar-separator--hide-mobile" />
      <div className="ana-character-wrapper">
        <AnaCharacter
          compact={true}
          onClick={handleAnaClick}
          isActive={showAnaChat}
          isLoading={anaIsLoading}
        />
        {showAnaChat && (
          <AnaChatPanel
            isOpen={showAnaChat}
            onClose={handleCloseChatPanel}
            messages={messages}
            onSendMessage={handleSendMessage}
            isLoading={anaIsLoading}
            error={anaError}
            streamingContent={streamingContent}
          />
        )}
      </div>
    </div>
  );
}
