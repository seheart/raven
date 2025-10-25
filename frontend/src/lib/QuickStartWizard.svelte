<script>
  import { onMount } from 'svelte';
  import { createEventDispatcher } from 'svelte';
  import { desktopNotifications } from './services/desktopNotifications.js';

  const dispatch = createEventDispatcher();

  // Wizard state
  let currentStep = 0;
  let projectPath = '';
  let selectedTemplate = 'ai-safety-basic';
  let notificationsEnabled = false;
  let error = null;
  let loading = false;

  // Available alert templates (with fallback defaults)
  let templates = [
    {
      id: 'ai-safety-basic',
      name: 'AI Safety (Recommended)',
      description: 'Essential alerts to keep your project safe while using AI coding assistants',
      icon: '🛡️',
      triggers: [
        { type: 'large_deletion', name: 'Large Code Deletion' },
        { type: 'security_file', name: 'Security File Modified' },
        { type: 'dependency_change', name: 'Dependencies Modified' }
      ]
    },
    {
      id: 'paranoid',
      name: 'Paranoid Mode',
      description: 'Maximum protection - alerts for every significant change',
      icon: '🚨',
      triggers: [
        { type: 'large_deletion', name: 'Large Code Deletion' },
        { type: 'security_file', name: 'Security File Modified' },
        { type: 'dependency_change', name: 'Dependencies Modified' },
        { type: 'rapid_changes', name: 'Rapid File Changes' },
        { type: 'config_change', name: 'Configuration Changes' }
      ]
    },
    {
      id: 'minimal',
      name: 'Minimal Alerts',
      description: 'Only critical issues - perfect for experienced users',
      icon: '🔕',
      triggers: [
        { type: 'security_file', name: 'Security File Modified' }
      ]
    }
  ];

  // Steps configuration
  const steps = [
    {
      title: 'Welcome to Raven!',
      subtitle: 'Your AI Safety Copilot',
      description: 'Raven watches over your projects while you code with AI assistants like Claude Code or Cursor. It keeps you safe with automatic syntax checking, session rollback, alerts for big changes, and security monitoring.'
    },
    {
      title: 'Choose Your Project',
      subtitle: 'What should I watch?',
      description: 'Point me to your project directory and I\'ll start monitoring file changes, keeping you informed of everything your AI coding assistant does.'
    },
    {
      title: 'Pick Your Alert Style',
      subtitle: 'How should I keep you safe?',
      description: 'Choose a preset that matches your experience level. You can always change this later in Settings.'
    },
    {
      title: 'Enable Notifications',
      subtitle: 'Never miss important changes',
      description: 'Desktop notifications let me alert you even when you\'re not looking at this dashboard. Perfect for catching mistakes before they become problems.'
    }
  ];

  // Store basePath for directory picker
  let basePath = '';

  // Load templates from API (fallback to defaults if it fails)
  onMount(async () => {
    try {
      console.log('🔄 [QuickStart] Fetching alert templates from /api/alerts/templates');
      const response = await fetch('/api/alerts/templates');
      console.log('📡 [QuickStart] Templates response status:', response.status, response.statusText);

      if (response.ok) {
        const text = await response.text();
        console.log('📄 [QuickStart] Response body length:', text.length, 'bytes');

        if (text.length === 0) {
          console.warn('⚠️ Empty response from templates API, using fallback templates');
        } else {
          try {
            const data = JSON.parse(text);
            // Override fallback templates with API data if available
            templates = Object.entries(data.templates).map(([id, template]) => ({
              id,
              ...template
            }));
            selectedTemplate = data.metadata?.recommended || 'ai-safety-basic';
            console.log('✅ Loaded alert templates from API:', templates.length, 'templates');
          } catch (parseErr) {
            console.error('❌ Failed to parse templates JSON:', parseErr);
            console.error('Response text:', text.substring(0, 200));
          }
        }
      } else {
        console.warn('⚠️ Using fallback templates (API returned', response.status, ')');
      }
    } catch (err) {
      console.error('❌ Error fetching templates:', err);
      console.warn('⚠️ Using fallback templates');
    }

    // Fetch basePath for directory picker
    try {
      console.log('🔄 [QuickStart] Fetching basePath from /api/projects');
      const configResponse = await fetch('/api/projects');
      console.log('📡 [QuickStart] Projects response status:', configResponse.status);

      if (configResponse.ok) {
        const text = await configResponse.text();
        console.log('📄 [QuickStart] Projects response length:', text.length, 'bytes');

        if (text.length > 0) {
          const config = JSON.parse(text);
          basePath = config.basePath || '';
          console.log('✅ Loaded basePath:', basePath);
        }
      }
    } catch (err) {
      console.error('❌ Error fetching basePath:', err);
    }
  });

  // Navigation
  function nextStep() {
    if (currentStep < steps.length) {
      currentStep++;
    }
  }

  function prevStep() {
    if (currentStep > 0) {
      currentStep--;
    }
  }

  // Handle directory picker
  function handleDirectorySelect(event) {
    const files = event.target.files;
    if (files.length > 0) {
      // Get the path from the first file in the directory
      const file = files[0];
      // Extract directory path by removing the filename
      const fullPath = file.webkitRelativePath || file.name;
      const pathParts = fullPath.split('/');

      // Extract just the directory name (sanitize it)
      let directoryName = pathParts[0];

      // Sanitize directory name to prevent path injection
      // Remove dangerous characters and patterns
      directoryName = directoryName.replace(/[<>:"|?*\0]/g, '');
      directoryName = directoryName.replace(/\.\./g, '');
      directoryName = directoryName.trim();

      if (!directoryName) {
        error = 'Invalid directory name';
        return;
      }

      // Construct absolute path using basePath from config
      if (basePath && directoryName) {
        // Remove trailing slash from basePath if present
        const cleanBasePath = basePath.replace(/\/+$/, '');

        // Validate basePath doesn't contain suspicious patterns
        if (cleanBasePath.includes('..') || cleanBasePath.includes('\0')) {
          error = 'Invalid base path configuration';
          return;
        }

        // Use path separator appropriate for the platform
        projectPath = `${cleanBasePath}/${directoryName}`;
      } else {
        // Fallback: just show the directory name if basePath not available
        projectPath = directoryName || fullPath;
      }
      error = null;
    }
  }

  // Trigger directory picker
  function browseDirectory() {
    const input = document.getElementById('directory-picker');
    if (input) {
      input.click();
    }
  }

  // Handle project path selection
  async function selectProjectDirectory() {
    if (!projectPath) {
      error = 'Please enter a project path';
      return;
    }
    error = null;
    nextStep();
  }

  // Handle template selection
  function selectAlertTemplate(templateId) {
    selectedTemplate = templateId;
    nextStep();
  }

  // Handle notification permission
  async function handleNotifications(enable) {
    if (enable) {
      const granted = await desktopNotifications.requestPermission();
      notificationsEnabled = granted;

      if (!granted) {
        error = 'Notifications permission denied. You can enable them later in browser settings.';
      } else {
        error = null;
      }
    }
    nextStep();
  }

  // Complete setup
  async function completeSetup() {
    console.log('🚀 [QuickStart] completeSetup called');
    console.log('   Project path:', projectPath);
    console.log('   Selected template:', selectedTemplate);
    console.log('   Notifications enabled:', notificationsEnabled);

    loading = true;
    error = null;

    try {
      // 1. Add project
      const projectName = projectPath.split('/').pop() || 'My Project';
      console.log('📦 [QuickStart] Creating project:', { name: projectName, path: projectPath });

      const projectResponse = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: projectName,
          path: projectPath,
          enabled: true
        })
      });

      console.log('📦 [QuickStart] Project response status:', projectResponse.status);

      if (!projectResponse.ok) {
        const errorData = await projectResponse.json();
        console.error('❌ [QuickStart] Project creation failed:', errorData);
        throw new Error(errorData.error || 'Failed to add project');
      }

      const project = await projectResponse.json();
      console.log('✅ [QuickStart] Project created:', project);

      // 2. Apply alert template
      console.log('⚡ [QuickStart] Applying alert template:', selectedTemplate, 'to project:', project.project?.id);

      const templateResponse = await fetch(`/api/alerts/templates/${selectedTemplate}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.project?.id
        })
      });

      console.log('⚡ [QuickStart] Template response status:', templateResponse.status);

      if (!templateResponse.ok) {
        const templateError = await templateResponse.json();
        console.error('❌ [QuickStart] Template application failed:', templateError);
        throw new Error(templateError.error || 'Failed to apply alert template');
      }

      console.log('✅ [QuickStart] Template applied successfully');

      // 3. Save wizard completion status
      localStorage.setItem('raven-quick-start-completed', 'true');
      localStorage.setItem('raven-welcome-seen', 'true');
      console.log('💾 [QuickStart] Saved completion status to localStorage');

      // 4. Close wizard
      loading = false;
      console.log('🎉 [QuickStart] Setup complete! Dispatching complete event');
      dispatch('complete', {
        projectId: project.project?.id,
        template: selectedTemplate,
        notifications: notificationsEnabled
      });
    } catch (err) {
      console.error('❌ [QuickStart] Setup failed:', err);
      error = err.message;
      loading = false;
    }
  }

  // Skip wizard
  function skipWizard() {
    localStorage.setItem('raven-quick-start-completed', 'true');
    dispatch('skip');
  }

  // Get progress percentage
  $: progress = ((currentStep + 1) / (steps.length + 1)) * 100;
</script>

<div class="wizard-overlay">
  <div class="wizard-container">
    <!-- Progress bar -->
    <div class="progress-bar">
      <div class="progress-fill" style="width: {progress}%"></div>
    </div>

    <!-- Header -->
    <div class="wizard-header">
      <h1>
        {#if currentStep < steps.length}
          {steps[currentStep].title}
        {:else}
          You're All Set!
        {/if}
      </h1>
      <p class="subtitle">
        {#if currentStep < steps.length}
          {steps[currentStep].subtitle}
        {:else}
          Ready to start monitoring
        {/if}
      </p>
    </div>

    <!-- Content -->
    <div class="wizard-content">
      {#if currentStep === 0}
        <!-- Step 0: Welcome -->
        <div class="step-content">
          <div class="welcome-icon">🛡️</div>
          <p class="description">{steps[0].description}</p>
          <div class="features-list">
            <div class="feature">
              <span class="feature-icon">⚠️</span>
              <span class="feature-text">Get alerted when AI deletes lots of code</span>
            </div>
            <div class="feature">
              <span class="feature-icon">🔒</span>
              <span class="feature-text">Know when security files are changed</span>
            </div>
            <div class="feature">
              <span class="feature-icon">↩️</span>
              <span class="feature-text">Undo any change with one click</span>
            </div>
            <div class="feature">
              <span class="feature-icon">📊</span>
              <span class="feature-text">See everything your AI does in real-time</span>
            </div>
          </div>
        </div>

      {:else if currentStep === 1}
        <!-- Step 1: Project Selection -->
        <div class="step-content">
          <p class="description">{steps[1].description}</p>
          <div class="project-input">
            <label for="project-path">Project Directory Path</label>
            <div class="path-input-group">
              <input
                id="project-path"
                type="text"
                bind:value={projectPath}
                placeholder="/Users/yourname/projects/myproject"
                on:keydown={(e) => e.key === 'Enter' && selectProjectDirectory()}
              />
              <button type="button" class="browse-btn" on:click={browseDirectory} title="Browse for directory">
                📁 Browse
              </button>
            </div>
            <!-- Hidden file input for directory selection -->
            <input
              id="directory-picker"
              type="file"
              webkitdirectory
              directory
              multiple
              style="display: none;"
              on:change={handleDirectorySelect}
            />
            <p class="hint">Type a path or click Browse to select a directory</p>
          </div>
          {#if error}
            <p class="error-message">{error}</p>
          {/if}
        </div>

      {:else if currentStep === 2}
        <!-- Step 2: Alert Template Selection -->
        <div class="step-content">
          <p class="description">{steps[2].description}</p>
          <div class="templates-grid">
            {#each templates as template}
              <button
                class="template-card"
                class:selected={selectedTemplate === template.id}
                on:click={() => selectAlertTemplate(template.id)}
              >
                <div class="template-icon">{template.icon}</div>
                <h3>{template.name}</h3>
                <p>{template.description}</p>
                <div class="template-triggers">
                  {template.triggers.length} alert{template.triggers.length !== 1 ? 's' : ''} enabled
                </div>
              </button>
            {/each}
          </div>
        </div>

      {:else if currentStep === 3}
        <!-- Step 3: Notifications -->
        <div class="step-content">
          <p class="description">{steps[3].description}</p>
          <div class="notification-preview">
            <div class="preview-notification">
              <div class="preview-icon">⚠️</div>
              <div class="preview-content">
                <strong>Large Code Deletion</strong>
                <p>AI deleted 150 lines in auth.js</p>
              </div>
            </div>
          </div>
          <div class="notification-buttons">
            <button class="btn-primary" on:click={() => handleNotifications(true)}>
              Enable Notifications
            </button>
            <button class="btn-secondary" on:click={() => handleNotifications(false)}>
              Skip for Now
            </button>
          </div>
          {#if error}
            <p class="error-message">{error}</p>
          {/if}
        </div>

      {:else}
        <!-- Step 4: Complete -->
        <div class="step-content">
          <div class="success-icon">✅</div>
          <p class="description">
            Raven is now watching <strong>{projectPath}</strong> and will alert you about important changes.
          </p>
          <div class="summary-box">
            <h4>Your Configuration:</h4>
            <ul>
              <li>Project: {projectPath}</li>
              <li>Alert Style: {templates.find(t => t.id === selectedTemplate)?.name || selectedTemplate}</li>
              <li>Notifications: {notificationsEnabled ? 'Enabled ✅' : 'Disabled (can enable later)'}</li>
            </ul>
          </div>
          {#if error}
            <p class="error-message">{error}</p>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Footer -->
    <div class="wizard-footer">
      {#if currentStep === 0}
        <button class="btn-secondary" on:click={skipWizard}>
          Skip Setup
        </button>
        <button class="btn-primary" on:click={nextStep}>
          Get Started →
        </button>
      {:else if currentStep === 1}
        <button class="btn-secondary" on:click={prevStep}>
          ← Back
        </button>
        <button class="btn-primary" on:click={selectProjectDirectory}>
          Next →
        </button>
      {:else if currentStep === 2}
        <button class="btn-secondary" on:click={prevStep}>
          ← Back
        </button>
        <span class="step-indicator">Selected: {templates.find(t => t.id === selectedTemplate)?.name}</span>
      {:else}
        <!-- Final step (3): Enable Notifications -->
        <button class="btn-secondary" on:click={prevStep}>
          ← Back
        </button>
        <button
          class="btn-primary btn-complete"
          on:click={completeSetup}
          disabled={loading}
        >
          {loading ? 'Setting up...' : 'Start Monitoring! 🚀'}
        </button>
      {/if}
    </div>
  </div>
</div>

<style>
  .wizard-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    backdrop-filter: blur(4px);
  }

  .wizard-container {
    background: var(--bg);
    border: 2px solid var(--accent);
    border-radius: 12px;
    width: 90%;
    max-width: 700px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  }

  .progress-bar {
    height: 4px;
    background: var(--border);
    border-radius: 12px 12px 0 0;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--accent), var(--accent-2, var(--accent)));
    transition: width 0.3s ease;
  }

  .wizard-header {
    padding: 32px 40px 24px;
    text-align: center;
    border-bottom: 1px solid var(--border);
  }

  .wizard-header h1 {
    margin: 0 0 8px 0;
    font-size: 28px;
    font-weight: 700;
    color: var(--text);
  }

  .subtitle {
    margin: 0;
    font-size: 16px;
    color: var(--muted);
    font-weight: 500;
  }

  .wizard-content {
    padding: 32px 40px;
    flex: 1;
    overflow-y: auto;
  }

  .step-content {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .welcome-icon, .success-icon {
    font-size: 64px;
    text-align: center;
    margin: 0 auto;
  }

  .description {
    font-size: 16px;
    line-height: 1.6;
    color: var(--text);
    text-align: center;
    margin: 0;
  }

  .features-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-width: 500px;
    margin: 0 auto;
  }

  .feature {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    background: var(--surface);
    border-radius: 8px;
  }

  .feature-icon {
    font-size: 24px;
    flex-shrink: 0;
  }

  .feature-text {
    font-size: 14px;
    color: var(--text);
    font-weight: 500;
  }

  .project-input {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .project-input label {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
  }

  .path-input-group {
    display: flex;
    gap: 8px;
    align-items: stretch;
  }

  .path-input-group input {
    flex: 1;
  }

  .project-input input {
    padding: 12px 16px;
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: 8px;
    color: var(--text);
    font-size: 15px;
    font-family: var(--mono);
    transition: border-color 0.2s;
  }

  .project-input input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .browse-btn {
    padding: 12px 20px;
    background: var(--surface-2);
    border: 2px solid var(--border);
    border-radius: 8px;
    color: var(--text);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .browse-btn:hover {
    background: var(--accent);
    border-color: var(--accent);
    color: white;
    transform: translateY(-1px);
  }

  .browse-btn:active {
    transform: translateY(0);
  }

  .hint {
    font-size: 13px;
    color: var(--muted);
    margin: 0;
  }

  .templates-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
  }

  .template-card {
    padding: 20px;
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    text-align: center;
  }

  .template-card:hover {
    border-color: var(--accent);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .template-card.selected {
    border-color: var(--accent);
    background: var(--surface-2);
    box-shadow: 0 0 0 3px rgba(var(--accent-rgb, 59, 130, 246), 0.1);
  }

  .template-icon {
    font-size: 40px;
    margin-bottom: 12px;
  }

  .template-card h3 {
    margin: 0 0 8px 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--text);
  }

  .template-card p {
    margin: 0 0 12px 0;
    font-size: 13px;
    color: var(--muted);
    line-height: 1.4;
  }

  .template-triggers {
    font-size: 12px;
    color: var(--accent);
    font-weight: 500;
  }

  .notification-preview {
    padding: 32px;
    background: var(--surface);
    border-radius: 8px;
    display: flex;
    justify-content: center;
  }

  .preview-notification {
    display: flex;
    gap: 12px;
    padding: 16px;
    background: white;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    max-width: 350px;
  }

  .preview-icon {
    font-size: 24px;
    flex-shrink: 0;
  }

  .preview-content strong {
    display: block;
    font-size: 14px;
    font-weight: 600;
    color: #1f2937;
    margin-bottom: 4px;
  }

  .preview-content p {
    margin: 0;
    font-size: 13px;
    color: #6b7280;
  }

  .notification-buttons {
    display: flex;
    gap: 12px;
    justify-content: center;
  }

  .summary-box {
    padding: 20px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
  }

  .summary-box h4 {
    margin: 0 0 12px 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--text);
  }

  .summary-box ul {
    margin: 0;
    padding-left: 20px;
  }

  .summary-box li {
    font-size: 14px;
    color: var(--text);
    margin-bottom: 8px;
  }

  .error-message {
    padding: 12px;
    background: #fee2e2;
    border: 1px solid #ef4444;
    border-radius: 6px;
    color: #991b1b;
    font-size: 14px;
    text-align: center;
    margin: 0;
  }

  .wizard-footer {
    padding: 20px 40px;
    border-top: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .btn-primary, .btn-secondary {
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
  }

  .btn-primary {
    background: var(--accent);
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    opacity: 0.9;
    transform: translateY(-1px);
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-secondary {
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
  }

  .btn-secondary:hover {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .btn-complete {
    font-size: 16px;
    padding: 14px 32px;
  }

  .step-indicator {
    font-size: 13px;
    color: var(--muted);
  }
</style>
