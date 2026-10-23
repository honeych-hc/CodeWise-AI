
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const Groq = require("groq-sdk");

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

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
  res.send("CodeWise AI Backend is running!");
});

async function askGroq(prompt, language) {
  const completion = await groq.chat.completions.create({
    model: "openai/gpt-oss-120b",
    messages: [
      {
        role: "system",
        content: `
You are CodeWise AI, an expert programming assistant.

The user's selected programming language is ${language}.

STRICT RULES:
1. Analyze the submitted code only as ${language}.
2. All corrected code must be valid ${language} syntax.
3. Never convert the code to Java unless Java is selected.
4. Never use Java syntax in Python, C, C++, or JavaScript answers.
5. Every corrected code block must use the correct Markdown language identifier.
6. Use exactly these identifiers:
   Java = java
   Python = python
   C = c
   C++ = cpp
   JavaScript = javascript
7. Keep explanations beginner-friendly and use clear Markdown.
8. Do not invent errors or claim you executed the code.
9. Preserve the program's intended behavior.
10. If no correction is needed, explain that instead of inventing a correction.
`,
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

  if (!Object.prototype.hasOwnProperty.call(
    supportedLanguages,
    language
  )) {
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

    const prompt = `
Review the following ${language} program.

SELECTED LANGUAGE: ${language}
EXPECTED CODE BLOCK IDENTIFIER: ${languageInfo.fence}
EXPECTED FILENAME: ${languageInfo.filename}

Required sections:
1. Code Summary
2. Errors or Bugs
3. Code Quality Improvements
4. Security Concerns, if any
5. Corrected Code, if needed
6. Simple Explanation

CORRECTED CODE REQUIREMENTS:
- Corrected code MUST be written in ${language}.
- Use the exact Markdown identifier "${languageInfo.fence}" for corrected code.
- The opening fence must be exactly:
  \`\`\`${languageInfo.fence}
- Do not use a Java code block unless the selected language is Java.
- Do not translate the program into another language.
- Use valid ${language} syntax and conventions.
- Preserve the original intended behavior.
- If multiple corrections are needed, provide one complete corrected program.
- If the code is already correct, say so and do not invent a correction.

Example of the required code block format:

\`\`\`${languageInfo.fence}
// Write corrected ${language} code here
\`\`\`

Review this code now:

\`\`\`${languageInfo.fence}
${code}
\`\`\`
`;

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
        "Code review failed. Check your Groq API key, model access, or usage limits.",
    });
  }
});

// CODE EXPLANATION
app.post("/api/explain", async (req, res) => {
  try {
    const input = validateRequest(req, res);

    if (!input) return;

    const { code, language, languageInfo } = input;

    const prompt = `
Explain this ${language} program to a beginner.

SELECTED LANGUAGE: ${language}
EXPECTED CODE BLOCK IDENTIFIER: ${languageInfo.fence}

Include:
1. Purpose of the program
2. Important lines explained
3. Step-by-step logic
4. Important ${language} concepts
5. Example output, if it can be determined reliably

Rules:
- Explain the actual submitted ${language} code.
- If showing code, use ${language} syntax.
- Use the Markdown identifier "${languageInfo.fence}" for ${language} code blocks.
- Never convert the program into Java or another language.
- Do not claim that you executed the program.
- Use simple English and clear Markdown headings.

Code to explain:

\`\`\`${languageInfo.fence}
${code}
\`\`\`
`;

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
        "Code explanation failed. Check your Groq API key, model access, or usage limits.",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
