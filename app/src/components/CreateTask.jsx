import { useState, useRef, useCallback } from "react";
import { Button } from "./Button.jsx";
import "../styles/create-task.css";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 10;

export function CreateTask({ onCreate, onCreateAndStart, commands = [], value, onValueChange }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [pendingImages, setPendingImages] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  const validateAndAddFiles = useCallback((files) => {
    const newImages = [];
    for (const file of files) {
      if (pendingImages.length + newImages.length >= MAX_FILES) {
        alert(`Maximum ${MAX_FILES} images allowed`);
        break;
      }
      if (!ALLOWED_TYPES.includes(file.type)) {
        alert(`Invalid file type: ${file.name}. Only PNG, JPG, GIF, WebP allowed.`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        alert(`File too large: ${file.name}. Maximum 10MB.`);
        continue;
      }
      // Create preview URL
      const previewUrl = URL.createObjectURL(file);
      newImages.push({ file, previewUrl, name: file.name });
    }
    if (newImages.length > 0) {
      setPendingImages((prev) => [...prev, ...newImages]);
    }
  }, [pendingImages.length]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    validateAndAddFiles(files);
  }, [validateAndAddFiles]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileSelect = useCallback((e) => {
    const files = Array.from(e.target.files || []);
    validateAndAddFiles(files);
    // Reset input so same file can be selected again
    e.target.value = "";
  }, [validateAndAddFiles]);

  const handlePaste = useCallback((e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles = [];
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      validateAndAddFiles(imageFiles);
    }
  }, [validateAndAddFiles]);

  const removeImage = useCallback((index) => {
    setPendingImages((prev) => {
      const newImages = [...prev];
      URL.revokeObjectURL(newImages[index].previewUrl);
      newImages.splice(index, 1);
      return newImages;
    });
  }, []);

  const clearAllImages = useCallback(() => {
    pendingImages.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    setPendingImages([]);
  }, [pendingImages]);

  const isSlash = value.startsWith("/");
  const query = isSlash ? value.slice(1).toLowerCase() : "";
  const filtered = isSlash
    ? commands.filter((c) => c.label.toLowerCase().includes(query))
    : [];
  const showDropdown = isSlash && filtered.length > 0;

  const executeCommand = (cmd) => {
    cmd.action();
    onValueChange("");
    setActiveIndex(0);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (showDropdown) {
      if (filtered[activeIndex]) {
        executeCommand(filtered[activeIndex]);
      }
      return;
    }
    if (!value.trim()) return;
    // Pass pending images to onCreate
    const imagesToUpload = pendingImages.map((img) => img.file);
    await onCreate(value.trim(), imagesToUpload);
    onValueChange("");
    clearAllImages();
  };

  const handleChange = (e) => {
    onValueChange(e.target.value);
    setActiveIndex(0);
  };

  const handleKeyDown = (e) => {
    if (showDropdown) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % filtered.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length);
      } else if (e.key === "Escape") {
        onValueChange("");
        setActiveIndex(0);
      }
      return;
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && value.trim() && onCreateAndStart) {
      e.preventDefault();
      const imagesToUpload = pendingImages.map((img) => img.file);
      onCreateAndStart(value.trim(), imagesToUpload);
      onValueChange("");
      clearAllImages();
    }
  };

  const handleBlur = () => {
    // Small delay so click on item registers before dropdown closes
    setTimeout(() => {
      if (value.startsWith("/")) {
        onValueChange("");
        setActiveIndex(0);
      }
    }, 150);
  };

  return (
    <div
      className={`create-task-wrapper${isDragging ? " dragging" : ""}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <form onSubmit={handleSubmit} className="create-task-form">
        <input
          ref={inputRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onPaste={handlePaste}
          placeholder="describe a task... (/ for commands)"
          autoComplete="off"
          style={{
            flex: 1,
            padding: "7px 12px",
            fontSize: 12,
            border: "1px solid var(--border)",
            borderRadius: 4,
            background: "var(--bg-surface)",
            color: "var(--text)",
            fontFamily: "var(--font-mono)",
            outline: "none",
          }}
        />
        <button
          type="button"
          className="image-attach-btn"
          onClick={() => fileInputRef.current?.click()}
          title="Attach images"
        >
          📎
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple
          onChange={handleFileSelect}
          style={{ display: "none" }}
        />
        <Button variant="primary" type="submit" size="md">
          add
        </Button>
      </form>

      {/* Image previews */}
      {pendingImages.length > 0 && (
        <div className="image-preview-container">
          {pendingImages.map((img, index) => (
            <div key={index} className="image-preview-item">
              <img src={img.previewUrl} alt={img.name} />
              <button
                type="button"
                className="image-preview-remove"
                onClick={() => removeImage(index)}
                title="Remove"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Drag overlay */}
      {isDragging && (
        <div className="drag-overlay">
          Drop images here
        </div>
      )}

      {showDropdown && (
        <div className="slash-dropdown">
          {filtered.map((cmd, i) => (
            <div
              key={cmd.label}
              className={`slash-item${i === activeIndex ? " active" : ""}`}
              onMouseDown={() => executeCommand(cmd)}
              onMouseEnter={() => setActiveIndex(i)}
            >
              <span className="slash-item-label">
                <span>/</span>{cmd.label}
              </span>
              {cmd.description && (
                <span className="slash-item-description">{cmd.description}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
