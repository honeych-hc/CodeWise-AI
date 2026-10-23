
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const Groq = require("groq-sdk");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const supportedLanguages = {
  Java: {
    fence: "java",
    filename: "Main.java",
  },
  Python: {
    fence: "python",
    filename: "main.py",
  },
  C: {
    fence: "c",
    filename: "main.c",
  },
  "C++": {
    fence: "cpp",
    filename: "main.cpp",
  },
  JavaScript: {
    fence: "javascript",
    filename: "main.js",
  },
};

app.get("/", (req, res) => {
  res.json({
    message: "CodeWise AI Backend is running!",
    status: "ok",
    endpoints: ["/api/review", "/api/explain"],
  });
});

async function askGroq(prompt, language) {
  const completion = await groq.chat.completions.create({
    model: "openai/gpt-oss-120b",
    messages: [
      {
        role: "system",
        content: `You are CodeWise AI, an expert programming assistant.

The selected language is ${language}.

Rules:
1. Analyze code only as ${language}.
2. Use valid ${language} syntax in all code examples.
3. Never convert code into another language.
4. Use the correct Markdown code identifier.
5. Be beginner-friendly and use clear headings.
6. Do not invent errors or claim that you executed code.
7. Preserve the program's intended behavior.
8. If no correction is needed, say so.

Code identifiers:
Java = java
Python = python
C = c
C++ = cpp
JavaScript = javascript`,
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0.1,
  });

  return (
    completion.choices[0]?.message?.content ||
    "No response generated."
  );
}

function validateRequest(req, res) {
  const { code, language = "Java" } = req.body || {};

  if (typeof code !== "string" || !code.trim()) {
    res.status(400).json({
      message: "Please enter some code.",
    });
    return null;
  }

  if (code.length > 50000) {
    res.status(413).json({
      message: "Code is too long. Maximum length is 50,000 characters.",
    });
    return null;
  }

  if (
    typeof language !== "string" ||
    !Object.prototype.hasOwnProperty.call(
      supportedLanguages,
      language
    )
  ) {
    res.status(400).json({
      message:
        "Unsupported language. Choose Java, Python, C, C++, or JavaScript.",
    });
    return null;
  }

  return {
    code: code.trim(),
    language,
    languageInfo: supportedLanguages[language],
  };
}

// CODE REVIEW
app.post("/api/review", async (req, res) => {
  try {
    const input = validateRequest(req, res);
    if (!input) return;

    const { code, language, languageInfo } = input;

    const prompt = `Review the following ${language} program.

Provide these sections:
1. Code Summary
2. Errors or Bugs
3. Code Quality Improvements
4. Security Concerns, if any
5. Corrected Code, if needed
6. Simple Explanation

The selected language is ${language}.
Expected code identifier: ${languageInfo.fence}
Expected filename: ${languageInfo.filename}

Rules:
- Corrected code must use ${language} syntax.
- Use this exact Markdown identifier: ${languageInfo.fence}
- Do not translate the program into another language.
- Preserve the intended behavior.
- Provide one complete corrected program if corrections are needed.
- If the code is already correct, do not invent errors.

Code to review:

\`\`\`${languageInfo.fence}
${code}
\`\`\``;

    const result = await askGroq(prompt, language);

    res.json({
      message: result,
      language,
      codeLanguage: languageInfo.fence,
    });
  } catch (error) {
    console.error("Groq Review API error:", error.message);

    res.status(500).json({
      message:
        "Code review failed. Check the server API key, model access, or usage limits.",
    });
  }
});

// CODE EXPLANATION
app.post("/api/explain", async (req, res) => {
  try {
    const input = validateRequest(req, res);
    if (!input) return;

    const { code, language, languageInfo } = input;

    const prompt = `Explain this ${language} program to a beginner.

Include:
1. Purpose of the program
2. Important lines explained
3. Step-by-step logic
4. Important ${language} concepts
5. Example output, if it can be determined reliably

Rules:
- Explain the submitted ${language} code.
- Use ${language} syntax in code examples.
- Use the Markdown identifier ${languageInfo.fence}.
- Never translate the program into another language.
- Do not claim you executed the program.
- Use simple English and clear headings.

Code to explain:

\`\`\`${languageInfo.fence}
${code}
\`\`\``;

    const result = await askGroq(prompt, language);

    res.json({
      message: result,
      language,
      codeLanguage: languageInfo.fence,
    });
  } catch (error) {
    console.error("Groq Explain API error:", error.message);

    res.status(500).json({
      message:
        "Code explanation failed. Check the server API key, model access, or usage limits.",
    });
  }
});

// Handle unknown routes
app.use((req, res) => {
  res.status(404).json({
    message: "Route not found.",
  });
});

// Start server using Render's assigned port
app.listen(PORT, "0.0.0.0", () => {
  console.log(`CodeWise AI backend running on port ${PORT}`);
});
