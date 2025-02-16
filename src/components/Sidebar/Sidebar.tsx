import { useState, useEffect, useRef } from "react";
import ReactMarkdown from 'react-markdown';
import "./Sidebar.css";

interface Message {
  text: string;
  isUser: boolean;
}

interface Settings {
  openaiKey?: string;
  openaiBaseUrl?: string;
  openaiModel?: string;
}

export const Sidebar = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [markdownContent, setMarkdownContent] = useState("");
  const [isMarkdownSectionCollapsed, setIsMarkdownSectionCollapsed] = useState(false);
  const [isRawMarkdown, setIsRawMarkdown] = useState(false);
  const [hasValidSettings, setHasValidSettings] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
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
      chrome.storage.sync.get(["openaiKey"], (result) => {
        setHasValidSettings(!!result.openaiKey);
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

  const addMessage = (text: string, isUser: boolean) => {
    setMessages((prev) => [...prev, { text, isUser }]);
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

    try {
      const settings = await new Promise<Settings>((resolve) => {
        chrome.storage.sync.get(
          ["openaiKey", "openaiBaseUrl", "openaiModel"],
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
        }),
      });

      const data = await response.json();
      if (data.choices && data.choices[0]) {
        addMessage(data.choices[0].message.content, false);
      }
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

      // Convert to markdown using Jina AI
      const fullUrl = `https://public-file-server-production.up.railway.app${saveData.url}`;
      const markdownResponse = await fetch(`https://r.jina.ai/${fullUrl}`, {
        headers: {
          Authorization:
            "Bearer jina_c4b5f4f16f9749079074cacc2786ffa7f43anXjRRj4lUa2tIiXq1Y2OOH6V",
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
          Please set your OpenAI API key in the
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
              setIsRawMarkdown(prev => !prev);
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
                <ReactMarkdown>{msg.text}</ReactMarkdown>
              )}
            </div>
          ))}
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
          <button 
            onClick={handleSendMessage}
            disabled={loading}
          >
            {loading ? "Sending..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
};
