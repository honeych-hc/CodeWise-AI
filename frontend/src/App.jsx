
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./App.css";

const LANGUAGE_OPTIONS = [
  { name: "Java", extension: "java", fence: "java" },
  { name: "Python", extension: "py", fence: "python" },
  { name: "C", extension: "c", fence: "c" },
  { name: "C++", extension: "cpp", fence: "cpp" },
  { name: "JavaScript", extension: "js", fence: "javascript" },
];

function getPlainText(node) {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) return node.map(getPlainText).join("");
  if (node && typeof node === "object" && node.props) {
    return getPlainText(node.props.children);
  }
  return "";
}

function extractResponse(data) {
  if (typeof data === "string") {
    const value = data.trim();

    if (
      (value.startsWith("{") && value.endsWith("}")) ||
      (value.startsWith("[") && value.endsWith("]"))
    ) {
      try {
        return extractResponse(JSON.parse(value));
      } catch {
        // Keep normal text.
      }
    }

    return value
      .replace(/\\r\\n/g, "\n")
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "  ");
  }

  if (Array.isArray(data)) {
    return data.map(extractResponse).filter(Boolean).join("\n\n");
  }

  if (!data || typeof data !== "object") {
    return data == null ? "" : String(data);
  }

  for (const key of [
    "result",
    "review",
    "explanation",
    "response",
    "message",
    "content",
    "text",
    "output",
  ]) {
    if (data[key] !== undefined && data[key] !== null) {
      const value = extractResponse(data[key]);
      if (value.trim()) return value;
    }
  }

  if (data.choices?.[0]?.message?.content) {
    return extractResponse(data.choices[0].message.content);
  }

  return JSON.stringify(data, null, 2);
}

function formatAIResponse(raw) {
  return String(raw ?? "").replace(/\r\n/g, "\n").trim();
}

function FormattedCodeBlock({
  children,
  className = "",
  languageOverride,
}) {
  const [copied, setCopied] = useState(false);
  const codeText = getPlainText(children);

  const detectedLanguage =
    className.match(/language-([\w+-]+)/)?.[1] || "";

  const language = languageOverride || detectedLanguage || "code";

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(codeText.trim());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="formatted-code">
      <div className="formatted-code-header">
        <span className="formatted-code-language">
          <span className="code-language-dot" />
          {language.toUpperCase()}
        </span>

        <button
          className="code-copy-button"
          onClick={copyCode}
          type="button"
          disabled={!codeText.trim()}
        >
          {copied ? "✓ Copied" : "Copy code"}
        </button>
      </div>

      <div className="formatted-code-content">
        <pre>
          <code>{codeText}</code>
        </pre>
      </div>
    </div>
  );
}

function createMarkdownComponents(language) {
  const selected = LANGUAGE_OPTIONS.find(
    (item) => item.name === language
  );

  const languageLabel = selected?.fence || "code";

  return {
    pre({ children }) {
      const child = Array.isArray(children) ? children[0] : children;

      return (
        <FormattedCodeBlock
          className={child?.props?.className || ""}
          languageOverride={languageLabel}
        >
          {child?.props?.children ?? children}
        </FormattedCodeBlock>
      );
    },

    h1({ children }) {
      return <h2 className="review-heading">{children}</h2>;
    },

    h2({ children }) {
      return <h3 className="review-heading">{children}</h3>;
    },

    h3({ children }) {
      return <h4 className="review-subheading">{children}</h4>;
    },

    a({ href, children }) {
      return (
        <a href={href} target="_blank" rel="noreferrer">
          {children}
        </a>
      );
    },
  };
}

function readHistory() {
  try {
    const saved = JSON.parse(
      localStorage.getItem("codewise-history") || "[]"
    );

    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function App() {
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState("Java");

  const [result, setResult] = useState("");
  const [explainResult, setExplainResult] = useState("");

  const [loading, setLoading] = useState(false);
  const [explainLoading, setExplainLoading] = useState(false);

  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [reviewCopied, setReviewCopied] = useState(false);

  const [history, setHistory] = useState(readHistory);
  const [showHistory, setShowHistory] = useState(false);

  const busy = loading || explainLoading;
  const lineCount = Math.max(1, code.split("\n").length);

  const selectedLanguage =
    LANGUAGE_OPTIONS.find((item) => item.name === language) ||
    LANGUAGE_OPTIONS[0];

  const filename =
    language === "Java" ? "Main.java" : `main.${selectedLanguage.extension}`;

  const hasCodeBlock = /```[\w+-]*[ \t]*\n[\s\S]*?```/.test(result);

  const markdownComponents = createMarkdownComponents(language);

  const saveToHistory = (type, codeText, output, codeLanguage) => {
    const item = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      code: codeText,
      output,
      language: codeLanguage,
      date: new Date().toLocaleString(),
    };

    setHistory((previous) => {
      const updated = [item, ...previous].slice(0, 50);

      try {
        localStorage.setItem(
          "codewise-history",
          JSON.stringify(updated)
        );
      } catch {
        setError("Could not save history in this browser.");
      }

      return updated;
    });
  };

  const openHistoryItem = (item) => {
    setCode(item.code);
    setLanguage(item.language || "Java");
    setResult(item.type === "Review" ? item.output : "");
    setExplainResult(
      item.type === "Explanation" ? item.output : ""
    );
    setError("");
    setCopied(false);
    setReviewCopied(false);

    document.getElementById("workspace")?.scrollIntoView({
      behavior: "smooth",
    });
  };

  const deleteHistoryItem = (id) => {
    setHistory((previous) => {
      const updated = previous.filter((item) => item.id !== id);

      try {
        localStorage.setItem(
          "codewise-history",
          JSON.stringify(updated)
        );
      } catch {
        setError("Could not update saved history.");
      }

      return updated;
    });
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem("codewise-history");
  };

  const sendRequest = async (endpoint, submittedCode, selectedLang) => {
    if (!submittedCode.trim()) {
      setError("Paste your code into the editor first.");
      return null;
    }

    setError("");

    try {
      const response = await fetch(
        `http://localhost:5000/api/${endpoint}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            code: submittedCode,
            language: selectedLang,
          }),
        }
      );

      const rawBody = await response.text();
      let data;

      try {
        data = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        data = rawBody;
      }

      if (!response.ok) {
        const message =
          typeof data === "string"
            ? data
            : data?.error ||
              data?.message ||
              `Request failed (${response.status}).`;

        throw new Error(message);
      }

      const text = formatAIResponse(extractResponse(data));

      if (!text.trim()) {
        throw new Error(
          "The AI returned an empty response. Please try again."
        );
      }

      return text;
    } catch (err) {
      setError(
        err.message ||
          "Could not connect to the backend. Check that your server is running."
      );
      return null;
    }
  };

  const reviewCode = async () => {
    if (!code.trim()) {
      setError("Paste your code into the editor first.");
      return;
    }

    const submittedCode = code;
    const submittedLanguage = language;

    setLoading(true);
    setError("");
    setResult("");
    setExplainResult("");
    setCopied(false);
    setReviewCopied(false);

    try {
      const response = await sendRequest(
        "review",
        submittedCode,
        submittedLanguage
      );

      if (response !== null) {
        setResult(response);
        saveToHistory(
          "Review",
          submittedCode,
          response,
          submittedLanguage
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const explainCode = async () => {
    if (!code.trim()) {
      setError("Paste your code into the editor first.");
      return;
    }

    const submittedCode = code;
    const submittedLanguage = language;

    setExplainLoading(true);
    setError("");
    setExplainResult("");

    try {
      const response = await sendRequest(
        "explain",
        submittedCode,
        submittedLanguage
      );

      if (response !== null) {
        setExplainResult(response);
        saveToHistory(
          "Explanation",
          submittedCode,
          response,
          submittedLanguage
        );
      }
    } finally {
      setExplainLoading(false);
    }
  };

  const copyText = async (text, type) => {
    try {
      await navigator.clipboard.writeText(text);

      if (type === "review") {
        setReviewCopied(true);
        window.setTimeout(() => setReviewCopied(false), 1800);
      } else {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      }

      setError("");
    } catch {
      setError("Copy failed. Try again using localhost in your browser.");
    }
  };

  const copyCorrectedCode = async () => {
    // Match any fenced code block, even if the AI used the wrong label.
    const matches = [
      ...result.matchAll(
        /```(?:[\w+-]+)?[ \t]*\n([\s\S]*?)```/g
      ),
    ];

    if (!matches.length) {
      setError("No corrected code block was found in the review.");
      return;
    }

    // The first code block is copied. Check the review if it contains
    // multiple examples before the corrected program.
    await copyText(matches[0][1].trim(), "corrected");
  };

  const clearEditor = () => {
    setCode("");
    setResult("");
    setExplainResult("");
    setError("");
    setCopied(false);
    setReviewCopied(false);
  };

  return (
    <div className="app">
      <div className="background-grid" aria-hidden="true" />
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />

      <header className="navbar">
        <a href="#home" className="brand">
          <span className="brand-mark">C<span></span></span>
          <span className="brand-name">
            CodeWise<span className="brand-accent"> AI</span>
          </span>
        </a>

        <nav className="nav-links">
          <a href="#features">Features</a>
          <a href="#workspace">Workspace</a>
          <a href="#history">History</a>
          <a href="#how-it-works">How it works</a>
        </nav>

        <a href="#workspace" className="nav-cta">
          <span className="nav-cta-dot" />
          Try the workspace <span>↗</span>
        </a>
      </header>

      <section className="hero section-shell" id="home">
        <div className="hero-eyebrow">
          <span className="live-dot" />
          YOUR AI-POWERED CODING PARTNER
          <span className="eyebrow-version">V1.0</span>
        </div>

        <h1 className="hero-title">
          Don't just write code.
          <br />
          <span className="gradient-text">Understand it.</span>
        </h1>

        <p className="hero-description">
          Review code, discover potential bugs, and understand complex
          logic across multiple programming languages.
        </p>

        <div className="hero-actions">
          <a href="#workspace" className="button button-primary">
            Start coding ↗
          </a>
          <a href="#features" className="button button-secondary">
            Explore features ↓
          </a>
        </div>

        <div className="hero-meta">
          <span><span className="meta-check">✓</span> AI-powered analysis</span>
          <span><span className="meta-check">✓</span> Beginner friendly</span>
          <span><span className="meta-check">✓</span> 5 languages supported</span>
        </div>

        <div className="hero-terminal">
          <div className="terminal-top">
            <div className="terminal-dots">
              <span /><span /><span />
            </div>
            <span className="terminal-filename">Main.java</span>
            <span className="terminal-status">
              <span className="live-dot" /> READY
            </span>
          </div>

          <div className="terminal-code">
            <div><span className="code-line-number">01</span> <span className="syntax-purple">public class</span>{" "}<span className="syntax-cyan">Main</span> {"{"}</div>
            <div><span className="code-line-number">02</span>{"  "}<span className="syntax-purple">public static void</span>{" "}<span className="syntax-cyan">main</span>(String[] args) {"{"}</div>
            <div><span className="code-line-number">03</span>{"    "}<span className="syntax-green">System.out.println</span>(<span className="syntax-yellow">"Hello, Developer!"</span>);</div>
            <div><span className="code-line-number">04</span>{"  }"}</div>
            <div><span className="code-line-number">05</span>{"}"}</div>
          </div>

          <div className="terminal-bottom">
            <span><span className="live-dot" /> AI ENGINE READY</span>
            <span>CODEWISE AI</span>
          </div>
        </div>
      </section>

      <section className="section-shell features-section" id="features">
        <div className="section-heading-row">
          <div>
            <div className="section-eyebrow">WHAT YOU CAN DO</div>
            <h2 className="section-title">
              Your workflow, <span className="gradient-text">upgraded.</span>
            </h2>
          </div>
          <p className="section-intro">
            Everything you need to learn from your code and improve your next solution.
          </p>
        </div>

        <div className="feature-grid">
          <article className="feature-card">
            <div className="feature-card-top">
              <span className="feature-icon">⌘</span>
              <span className="feature-number">01</span>
            </div>
            <div className="feature-tag">ANALYZE</div>
            <h3>Intelligent Code Review</h3>
            <p>Find potential bugs, logic errors, and code quality issues.</p>
            <a href="#workspace" className="feature-link">Review code ↗</a>
          </article>

          <article className="feature-card">
            <div className="feature-card-top">
              <span className="feature-icon">✳</span>
              <span className="feature-number">02</span>
            </div>
            <div className="feature-tag">LEARN</div>
            <h3>Understand Any Logic</h3>
            <p>Break down code into simple, beginner-friendly explanations.</p>
            <a href="#workspace" className="feature-link">Explain code ↗</a>
          </article>

          <article className="feature-card">
            <div className="feature-card-top">
              <span className="feature-icon">⌘</span>
              <span className="feature-number">03</span>
            </div>
            <div className="feature-tag">MULTI-LANGUAGE</div>
            <h3>Five Languages</h3>
            <p>Work with Java, Python, C, C++ and JavaScript.</p>
            <a href="#workspace" className="feature-link">Choose language ↗</a>
          </article>
        </div>
      </section>

      <section className="section-shell workspace-section" id="workspace">
        <div className="workspace-heading">
          <div className="section-eyebrow">
            <span className="live-dot" /> YOUR CODING ENVIRONMENT
          </div>
          <h2 className="section-title">
            Let's work on <span className="gradient-text">your code.</span>
          </h2>
          <p className="section-intro">
            Select a programming language, paste your code, and get AI feedback.
          </p>
        </div>

        <div className="workspace-panel">
          <div className="workspace-topbar">
            <div className="workspace-file">
              <span className="java-file-icon">
                {language === "Python"
                  ? "Py"
                  : language === "JavaScript"
                  ? "JS"
                  : language === "C++"
                  ? "C+"
                  : language === "C"
                  ? "C"
                  : "J"}
              </span>
              <span>{filename}</span>
              <span className="file-dot" />
            </div>

            <div className="workspace-topbar-right">
              <select
                className="language-badge language-select"
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                aria-label="Select programming language"
              >
                {LANGUAGE_OPTIONS.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.name}
                  </option>
                ))}
              </select>

              <button className="clear-button" onClick={clearEditor} type="button">
                Clear editor
              </button>
            </div>
          </div>

          <div className="editor">
            <div className="line-numbers" aria-hidden="true">
              {Array.from({ length: lineCount }, (_, index) => (
                <span key={index}>{String(index + 1).padStart(2, "0")}</span>
              ))}
            </div>

            <textarea
              className="code-input"
              id="code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder={`// Paste your ${language} code here...`}
              spellCheck="false"
              autoCapitalize="off"
              autoCorrect="off"
              aria-label={`${language} code editor`}
            />
          </div>

          <div className="editor-footer">
            <span><span className="editor-status-dot" /> Editor ready</span>
            <span>{lineCount} lines · {language}</span>
          </div>

          {error && (
            <div className="error-message" role="alert">
              <span>!</span> {error}
            </div>
          )}

          <div className="workspace-actions">
            <div className="workspace-action-copy">
              <strong>Ready to improve your code?</strong>
              <span>Choose an AI action to get started.</span>
            </div>

            <div className="action-buttons">
              <button
                className="button button-primary"
                onClick={reviewCode}
                disabled={busy}
                type="button"
              >
                {loading ? <><span className="spinner" /> Reviewing...</> : "✳ Review code"}
              </button>

              <button
                className="button button-secondary"
                onClick={explainCode}
                disabled={busy}
                type="button"
              >
                {explainLoading ? <><span className="spinner" /> Explaining...</> : "⌘ Explain code"}
              </button>
            </div>
          </div>
        </div>

        {loading && (
          <div className="loading-panel">
            <span className="spinner large-spinner" />
            <div>
              <strong>Analyzing your {language} code</strong>
              <p>Looking for bugs and improvement opportunities...</p>
            </div>
          </div>
        )}

        {result && (
          <section className="output-panel">
            <div className="output-header">
              <div className="output-title">
                <span className="output-icon">✳</span>
                <div>
                  <h3>Code review</h3>
                  <p>AI analysis of your {language} code</p>
                </div>
              </div>

              <div className="output-actions">
                <button
                  className="copy-button"
                  onClick={() => copyText(result, "review")}
                  type="button"
                >
                  {reviewCopied ? "✓ Copied review" : "Copy review"}
                </button>

                {hasCodeBlock && (
                  <button
                    className="copy-button"
                    onClick={copyCorrectedCode}
                    type="button"
                  >
                    {copied ? "✓ Copied code" : "Copy corrected code"}
                  </button>
                )}
              </div>
            </div>

            <div className="markdown-result">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={markdownComponents}
              >
                {result}
              </ReactMarkdown>
            </div>
          </section>
        )}

        {explainLoading && (
          <div className="loading-panel">
            <span className="spinner large-spinner" />
            <div>
              <strong>Preparing your explanation</strong>
              <p>Breaking down the code into understandable steps...</p>
            </div>
          </div>
        )}

        {explainResult && (
          <section className="output-panel">
            <div className="output-header">
              <div className="output-title">
                <span className="output-icon output-icon-cyan">⌘</span>
                <div>
                  <h3>Code explanation</h3>
                  <p>Your {language} code, explained simply</p>
                </div>
              </div>
            </div>

            <div className="markdown-result">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={markdownComponents}
              >
                {explainResult}
              </ReactMarkdown>
            </div>
          </section>
        )}
      </section>

      <section className="section-shell history-section" id="history">
        <div className="history-heading">
          <div>
            <div className="section-eyebrow">YOUR PREVIOUS WORK</div>
            <h2 className="section-title">
              Review <span className="gradient-text">History.</span>
            </h2>
            <p className="section-intro">
              Revisit your previous code reviews and explanations.
            </p>
          </div>

          <button
            className="button button-secondary"
            type="button"
            onClick={() => setShowHistory((visible) => !visible)}
          >
            {showHistory ? "Hide history" : `View history (${history.length})`}
          </button>
        </div>

        {showHistory && (
          <div className="history-list">
            {history.length === 0 ? (
              <div className="history-empty">
                <h3>No history yet</h3>
                <p>Your code reviews and explanations will appear here.</p>
              </div>
            ) : (
              <>
                <div className="history-toolbar">
                  <span>{history.length} saved items</span>
                  <button
                    className="clear-button"
                    type="button"
                    onClick={clearHistory}
                  >
                    Clear all history
                  </button>
                </div>

                {history.map((item) => (
                  <article className="history-item" key={item.id}>
                    <div className="history-item-info">
                      <span className="history-type">
                        {item.type} · {item.language || "Java"}
                      </span>
                      <h3>
                        {item.code.split("\n")[0].slice(0, 55) ||
                          "Untitled code"}
                      </h3>
                      <p>{item.date}</p>
                    </div>

                    <div className="history-item-actions">
                      <button
                        className="copy-button"
                        type="button"
                        onClick={() => openHistoryItem(item)}
                      >
                        Open
                      </button>
                      <button
                        className="copy-button"
                        type="button"
                        onClick={() => deleteHistoryItem(item.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
              </>
            )}
          </div>
        )}
      </section>

      <section className="section-shell how-section" id="how-it-works">
        <div className="section-eyebrow">SIMPLE BY DESIGN</div>
        <h2 className="section-title">
          From code to <span className="gradient-text">clarity.</span>
        </h2>

        <div className="steps-grid">
          <article className="step-card">
            <span className="step-number">01</span>
            <h3>Choose</h3>
            <p>Select your programming language.</p>
          </article>
          <article className="step-card">
            <span className="step-number">02</span>
            <h3>Analyze</h3>
            <p>Choose code review or explanation.</p>
          </article>
          <article className="step-card">
            <span className="step-number">03</span>
            <h3>Improve</h3>
            <p>Learn from the AI feedback.</p>
          </article>
        </div>
      </section>

      <footer className="footer">
        <a href="#home" className="brand footer-brand">
          <span className="brand-mark">C<span></span></span>
          <span className="brand-name">
            CodeWise<span className="brand-accent"> AI</span>
          </span>
        </a>
        <p>Think clearly. Code confidently.</p>
        <a href="#home" className="back-to-top">Back to top ↑</a>
      </footer>
    </div>
  );
}

export default App;
