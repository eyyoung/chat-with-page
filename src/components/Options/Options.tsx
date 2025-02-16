import { useState, useEffect } from 'react';
import './Options.css';

interface Settings {
  openaiKey: string;
  openaiBaseUrl: string;
  openaiModel: string;
  jinaKey: string;
}

export const Options = () => {
  const [settings, setSettings] = useState<Settings>({
    openaiKey: '',
    openaiBaseUrl: '',
    openaiModel: 'gpt-3.5-turbo',
    jinaKey: '',
  });
  const [status, setStatus] = useState<{ message: string; isError: boolean } | null>(null);

  useEffect(() => {
    // Load saved settings
    chrome.storage.sync.get(['openaiKey', 'openaiBaseUrl', 'openaiModel', 'jinaKey'], (result) => {
      setSettings({
        openaiKey: result.openaiKey || '',
        openaiBaseUrl: result.openaiBaseUrl || '',
        openaiModel: result.openaiModel || 'gpt-3.5-turbo',
        jinaKey: result.jinaKey || '',
      });
    });
  }, []);

  const showStatus = (message: string, isError = false) => {
    setStatus({ message, isError });
    setTimeout(() => {
      setStatus(null);
    }, 3000);
  };

  const requestHostPermission = async (url: string): Promise<boolean> => {
    try {
      // Convert the URL to a pattern that matches the entire domain
      const urlObj = new URL(url);
      const pattern = `${urlObj.protocol}//${urlObj.hostname}/*`;
      
      const granted = await chrome.permissions.request({
        origins: [pattern]
      });
      
      return granted;
    } catch (error) {
      console.error('Error requesting host permission:', error);
      return false;
    }
  };

  const handleSave = async () => {
    if (!settings.openaiKey.trim()) {
      showStatus('Please enter your OpenAI API key', true);
      return;
    }

    // If openaiBaseUrl is provided, request host permission
    if (settings.openaiBaseUrl.trim()) {
      try {
        const granted = await requestHostPermission(settings.openaiBaseUrl);
        if (!granted) {
          showStatus('Host permission denied. Settings not saved.', true);
          return;
        }
      } catch (error) {
        showStatus('Invalid URL format', true);
        return;
      }
    }

    chrome.storage.sync.set(
      {
        openaiKey: settings.openaiKey,
        openaiBaseUrl: settings.openaiBaseUrl,
        openaiModel: settings.openaiModel,
        jinaKey: settings.jinaKey,
      },
      () => {
        showStatus('Settings saved successfully!');
      }
    );
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setSettings(prev => ({
      ...prev,
      [id]: value,
    }));
  };

  return (
    <div className="settings-container">
      <h2>Chat with Page Settings</h2>
      <div className="form-group">
        <label htmlFor="openaiKey">OpenAI API Key:</label>
        <input
          type="password"
          id="openaiKey"
          value={settings.openaiKey}
          onChange={handleChange}
          placeholder="Enter your OpenAI API key"
        />
      </div>
      <div className="form-group">
        <label htmlFor="openaiBaseUrl">OpenAI Base URL (optional):</label>
        <input
          type="text"
          id="openaiBaseUrl"
          value={settings.openaiBaseUrl}
          onChange={handleChange}
          placeholder="https://api.openai.com/v1"
        />
        <small className="help-text">
          Note: Adding a custom base URL will require additional host permissions
        </small>
      </div>
      <div className="form-group">
        <label htmlFor="openaiModel">Model Name:</label>
        <input
          type="text"
          id="openaiModel"
          value={settings.openaiModel}
          onChange={handleChange}
          placeholder="gpt-3.5-turbo"
        />
      </div>
      <div className="form-group">
        <label htmlFor="jinaKey">Jina API Key:</label>
        <input
          type="password"
          id="jinaKey"
          value={settings.jinaKey}
          onChange={handleChange}
          placeholder="Enter your Jina API key"
        />
      </div>
      <button onClick={handleSave}>Save Settings</button>
      {status && (
        <div className={`status ${status.isError ? 'error' : 'success'}`}>
          {status.message}
        </div>
      )}
    </div>
  );
};
