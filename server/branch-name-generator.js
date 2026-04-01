import OpenAI from "openai";

function generateSlugFallback(instruction) {
  if (!instruction) return "";

  let slug = instruction.toLowerCase().replace(/[ _]/g, "-");
  slug = slug.replace(/[^a-z0-9-]/g, "");
  slug = slug.replace(/-+/g, "-");
  slug = slug.replace(/^-+|-+$/g, "");

  if (!slug) return "";

  if (slug.length > 50) {
    const truncated = slug.substring(0, 50);
    const trimmed = truncated.substring(0, truncated.lastIndexOf("-"));
    slug = trimmed || truncated;
    slug = slug.replace(/-+$/, "");
  }

  return slug;
}

function sanitizeBranchName(name) {
  if (!name) return "";

  let slug = name.toLowerCase().replace(/[ _]/g, "-");
  slug = slug.replace(/[^a-z0-9-]/g, "");
  slug = slug.replace(/-+/g, "-");
  slug = slug.replace(/^-+|-+$/g, "");

  if (slug.length > 50) {
    const truncated = slug.substring(0, 50);
    const trimmed = truncated.substring(0, truncated.lastIndexOf("-"));
    slug = trimmed || truncated;
    slug = slug.replace(/-+$/, "");
  }

  return slug;
}

export async function generateBranchName(instruction) {
  if (!instruction) {
    return "";
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return generateSlugFallback(instruction);
  }

  try {
    const openai = new OpenAI({ apiKey });

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 50,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: `You are a git branch name generator. Given a task description, generate a concise, semantic branch name slug.

Rules:
- Output ONLY the branch slug (no "task/" prefix, no explanation)
- Use lowercase letters, numbers, and hyphens only
- Maximum 40 characters
- Be concise but meaningful (e.g., "fix-auth-btn-color" not "fix-login-button-color-issue")
- Focus on the key action and target (e.g., "add-user-avatar", "fix-nav-dropdown")
- Use common abbreviations: btn, nav, auth, config, db, api, ui, etc.`,
        },
        {
          role: "user",
          content: instruction,
        },
      ],
    });

    const generatedName = response.choices?.[0]?.message?.content?.trim();

    if (!generatedName) {
      return generateSlugFallback(instruction);
    }

    const sanitized = sanitizeBranchName(generatedName);
    return sanitized || generateSlugFallback(instruction);
  } catch (error) {
    console.error("[branch-name-generator] OpenAI API error, using fallback:", error.message);
    return generateSlugFallback(instruction);
  }
}
