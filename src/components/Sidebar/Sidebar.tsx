import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import "./Sidebar.css";

interface Message {
  text: string;
  isUser: boolean;
  reasoning?: string;
}

interface Settings {
  openaiKey?: string;
  openaiBaseUrl?: string;
  openaiModel?: string;
  jinaKey?: string;
}

export const Sidebar = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [markdownContent, setMarkdownContent] = useState("");
  const [isMarkdownSectionCollapsed, setIsMarkdownSectionCollapsed] =
    useState(false);
  const [isRawMarkdown, setIsRawMarkdown] = useState(false);
  const [hasValidSettings, setHasValidSettings] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [partialMessage, setPartialMessage] = useState("");
  const [partialReasoning, setPartialReasoning] = useState("");
  const [reasoningCollapsed, setReasoningCollapsed] = useState<{[key: number]: boolean}>({});
  const messageContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    checkSettings();
  }, []);

  useEffect(() => {
    if (messageContainerRef.current) {
      messageContainerRef.current.scrollTop =
        messageContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const checkSettings = () => {
    if (
      typeof chrome !== "undefined" &&
      chrome.storage &&
      chrome.storage.sync
    ) {
      chrome.storage.sync.get(["openaiKey", "jinaKey"], (result) => {
        setHasValidSettings(!!result.openaiKey && !!result.jinaKey);
      });
    }
  };

  const openSettings = () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL("options.html"));
    }
  };

  const addMessage = (text: string, isUser: boolean, reasoning?: string) => {
    setMessages((prev) => [...prev, { text, isUser, reasoning }]);
  };

  const handleSendMessage = async () => {
    if (!hasValidSettings) {
      return;
    }

    const message = userInput.trim();
    if (!message) return;

    addMessage(message, true);
    setUserInput("");
    setLoading(true);
    setPartialMessage("");
    setPartialReasoning("");

    try {
      const settings = await new Promise<Settings>((resolve) => {
        chrome.storage.sync.get(
          ["openaiKey", "openaiBaseUrl", "openaiModel", "jinaKey"],
          resolve as (items: { [key: string]: any }) => void
        );
      });

      const baseUrl =
        settings.openaiBaseUrl?.trim() || "https://api.openai.com/v1";

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.openaiKey}`,
        },
        body: JSON.stringify({
          model: settings.openaiModel || "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content: `You are a helpful assistant that helps users understand and interact with the following markdown content:\n\n${markdownContent}\n\nProvide concise and accurate responses about the content above.`,
            },
            {
              role: "user",
              content: message,
            },
          ],
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No reader available");
      }

      const decoder = new TextDecoder();
      let currentMessage = "";
      let currentReasoning = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ") && line !== "data: [DONE]") {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.choices[0]?.delta?.content) {
                currentMessage += data.choices[0].delta.content;
                setPartialMessage(currentMessage);
              }
              if (data.choices[0]?.delta?.reasoning_content) {
                currentReasoning += data.choices[0].delta.reasoning_content;
                setPartialReasoning(currentReasoning);
              }
            } catch (error) {
              console.error("Error parsing stream:", error);
            }
          }
        }
      }

      addMessage(currentMessage, false, currentReasoning);
      setPartialMessage("");
      setPartialReasoning("");
    } catch (error) {
      addMessage("Error: Failed to get response from OpenAI", false);
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleConvertToMarkdown = async () => {
    setIsConverting(true);
    setMarkdownContent("");

    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab.id) return;

      // Get HTML content
      const [{ result: htmlContent }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => document.documentElement.outerHTML,
      });

      if (!htmlContent) return;

      // Save HTML content
      const saveResponse = await fetch(
        "https://public-file-server-production.up.railway.app/save-html",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            htmlContent: btoa(unescape(encodeURIComponent(htmlContent))),
          }),
        }
      );

      const saveData = await saveResponse.json();
      if (!saveData.success) {
        throw new Error("Failed to save HTML");
      }

      const settings = await new Promise<Settings>((resolve) => {
        chrome.storage.sync.get(
          ["openaiKey", "openaiBaseUrl", "openaiModel", "jinaKey"],
          resolve as (items: { [key: string]: any }) => void
        );
      });

      // Convert to markdown using Jina AI
      const fullUrl = `https://public-file-server-production.up.railway.app${saveData.url}`;
      const markdownResponse = await fetch(`https://r.jina.ai/${fullUrl}`, {
        headers: {
          Authorization: `Bearer ${settings.jinaKey}`,
          "X-Respond-With": "readerlm-v2"
        },
      });

      const markdownContent = await markdownResponse.text();
      if (markdownContent) {
        setMarkdownContent(markdownContent);
        setIsMarkdownSectionCollapsed(false);
      } else {
        setMarkdownContent("No content available");
        setIsMarkdownSectionCollapsed(false);
      }
    } catch (error: any) {
      console.error("Error converting to markdown:", error);
      setMarkdownContent(`Error: ${error.message}`);
    } finally {
      setIsConverting(false);
    }
  };

  return (
    <div className="main-container">
      {!hasValidSettings && (
        <div id="settingsPrompt">
          Please set your OpenAI API key and Jina API key in the
          <button onClick={openSettings}>settings</button>
        </div>
      )}

      <div className="convert-section">
        <button
          id="convertButton"
          onClick={handleConvertToMarkdown}
          disabled={isConverting}
        >
          {isConverting ? "Converting..." : "Convert Page to Markdown"}
        </button>
      </div>

      <div
        id="markdownSection"
        className={isMarkdownSectionCollapsed ? "collapsed" : ""}
      >
        <div
          className="collapsible"
          onClick={() => setIsMarkdownSectionCollapsed((prev) => !prev)}
        >
          <span>Markdown Content</span>
          <button
            className="view-toggle"
            onClick={(e) => {
              e.stopPropagation();
              setIsRawMarkdown((prev) => !prev);
            }}
          >
            {isRawMarkdown ? "Show Rendered" : "Show Raw"}
          </button>
          <span className="toggle-icon">
            {isMarkdownSectionCollapsed ? "▼" : "▲"}
          </span>
        </div>
        <div id="markdownOutput">
          {isRawMarkdown ? (
            <pre>{markdownContent}</pre>
          ) : (
            <ReactMarkdown>{markdownContent}</ReactMarkdown>
          )}
        </div>
      </div>

      <div className="chat-section">
        <div id="messageContainer" ref={messageContainerRef}>
          {messages.map((msg, index) => (
            <div
              key={index}
              className={`message ${msg.isUser ? "user" : "assistant"}`}
            >
              {msg.isUser ? (
                msg.text
              ) : (
                <>
                  {msg.reasoning && (
                    <div className="thinking-box">
                      <div 
                        className="thinking-header" 
                        onClick={() => setReasoningCollapsed(prev => ({
                          ...prev,
                          [index]: !prev[index]
                        }))}
                      >
                        <span>Thinking{reasoningCollapsed[index] ? '...' : ' Complete'}</span>
                        <span className="toggle-icon">
                          {reasoningCollapsed[index] ? '▼' : '▲'}
                        </span>
                      </div>
                      {!reasoningCollapsed[index] && (
                        <div className="thinking-content">
                          <ReactMarkdown>{msg.reasoning}</ReactMarkdown>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="markdown-assistant">
                    <ReactMarkdown>{msg.text}</ReactMarkdown>
                  </div>
                </>
              )}
            </div>
          ))}
          {(partialMessage || partialReasoning) && (
            <div className="message assistant">
              {partialReasoning && (
                <div className="thinking-box">
                  <div className="thinking-header">
                    <span>Thinking...</span>
                    <span className="toggle-icon">▼</span>
                  </div>
                  <div className="thinking-content">
                    <ReactMarkdown>{partialReasoning}</ReactMarkdown>
                  </div>
                </div>
              )}
              {partialMessage && (
                <div className="markdown-assistant">
                  <ReactMarkdown>{partialMessage}</ReactMarkdown>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="inputContainer">
          <input
            type="text"
            id="userInput"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
            placeholder="Ask about the content..."
            disabled={loading}
          />
          <button onClick={handleSendMessage} disabled={loading}>
            {loading ? "Sending..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
};
