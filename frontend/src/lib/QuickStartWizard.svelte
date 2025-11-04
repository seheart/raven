<script>
  import { logger } from './logger.js';
  import { onMount } from 'svelte';
  import { createEventDispatcher } from 'svelte';
  import { desktopNotifications } from './services/desktopNotifications.js';

  const dispatch = createEventDispatcher();

  // Wizard state
  let currentStep = 0;
  let projectPath = '/home/seth/Projects';
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
      title: 'Choose Your Projects Folder',
      subtitle: 'Where are all your projects?',
      description: 'Point me to the parent folder containing all your projects (like /home/yourname/Projects). I\'ll monitor all projects inside it automatically.'
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

  // Load templates from API
  onMount(async () => {
    try {
      logger.info('🔄 [QuickStart] Fetching alert templates from /api/alerts/templates');
      const response = await fetch('/api/alerts/templates');
      logger.info('📡 [QuickStart] Templates response status:', response.status, response.statusText);

      if (response.ok) {
        const text = await response.text();
        logger.info('📄 [QuickStart] Response body length:', text.length, 'bytes');

        if (text.length === 0) {
          logger.warn('⚠️ Empty response from templates API, using fallback templates');
        } else {
          try {
            const data = JSON.parse(text);
            // Override fallback templates with API data if available
            templates = Object.entries(data.templates).map(([id, template]) => ({
              id,
              ...template
            }));
            selectedTemplate = data.metadata?.recommended || 'ai-safety-basic';
            logger.info('✅ Loaded alert templates from API:', templates.length, 'templates');
          } catch (parseErr) {
            logger.error('❌ Failed to parse templates JSON:', parseErr);
            logger.error('Response text:', text.substring(0, 200));
          }
        }
      } else {
        logger.warn('⚠️ Using fallback templates (API returned', response.status, ')');
      }
    } catch (err) {
      logger.error('❌ Error fetching templates:', err);
      logger.warn('⚠️ Using fallback templates');
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

  // Handle projects folder path selection
  async function selectProjectDirectory() {
    if (!projectPath || projectPath.trim() === '') {
      error = 'Please enter your projects folder path';
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
    try {
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
    } catch (err) {
      logger.error('Failed to handle notifications:', err);
      error = 'Failed to request notification permissions';
      notificationsEnabled = false;
    }
  }

  // Complete setup
  async function completeSetup() {
    logger.info('🚀 [QuickStart] completeSetup called');
    logger.info('   Projects folder:', projectPath);
    logger.info('   Selected template:', selectedTemplate);
    logger.info('   Notifications enabled:', notificationsEnabled);

    loading = true;
    error = null;

    try {
      // Raven auto-discovers and monitors all projects in the folder at startup
      // No API call needed - monitoring is already active!
      logger.info('✅ [QuickStart] Projects in', projectPath, 'are already being monitored');

      // Save wizard completion status
      localStorage.setItem('raven-quick-start-completed', 'true');
      localStorage.setItem('raven-welcome-seen', 'true');
      logger.info('💾 [QuickStart] Saved completion status to localStorage');

      // Close wizard
      loading = false;
      logger.info('🎉 [QuickStart] Setup complete! Dispatching complete event');
      dispatch('complete', {
        projectsFolder: projectPath,
        template: selectedTemplate,
        notifications: notificationsEnabled
      });
    } catch (err) {
      logger.error('❌ [QuickStart] Setup failed:', err);
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

<div class="wizard-overlay" role="dialog" aria-modal="true" aria-labelledby="wizard-heading">
  <div class="wizard-container">
    <!-- Progress bar -->
    <div class="progress-bar" role="progressbar" aria-valuenow={progress} aria-valuemin="0" aria-valuemax="100" aria-label="Setup progress: {progress.toFixed(0)}%">
      <div class="progress-fill" style="width: {progress}%"></div>
    </div>

    <!-- Header -->
    <div class="wizard-header">
      <h1 id="wizard-heading">
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
    <div class="wizard-content" role="region" aria-live="polite">
      {#if currentStep === 0}
        <!-- Step 0: Welcome -->
        <div class="step-content">
          <div class="welcome-icon" aria-hidden="true">🛡️</div>
          <p class="description">{steps[0].description}</p>
          <div class="features-list" role="list" aria-label="Key features">
            <div class="feature" role="listitem">
              <span class="feature-icon" aria-hidden="true">⚠️</span>
              <span class="feature-text">Get alerted when AI deletes lots of code</span>
            </div>
            <div class="feature" role="listitem">
              <span class="feature-icon" aria-hidden="true">🔒</span>
              <span class="feature-text">Know when security files are changed</span>
            </div>
            <div class="feature" role="listitem">
              <span class="feature-icon" aria-hidden="true">↩️</span>
              <span class="feature-text">Undo any change with one click</span>
            </div>
            <div class="feature" role="listitem">
              <span class="feature-icon" aria-hidden="true">📊</span>
              <span class="feature-text">See everything your AI does in real-time</span>
            </div>
          </div>
        </div>

      {:else if currentStep === 1}
        <!-- Step 1: Projects Folder Selection -->
        <div class="step-content">
          <p class="description">{steps[1].description}</p>
          <div class="project-input">
            <label for="project-path">Projects Folder Path</label>
            <input
              id="project-path"
              type="text"
              bind:value={projectPath}
              placeholder="/home/yourname/Projects"
              on:keydown={(e) => e.key === 'Enter' && selectProjectDirectory()}
            />
            <p class="hint" id="path-hint">This should be the parent folder containing all your individual projects</p>
          </div>
          {#if error}
            <p class="error-message" role="alert">{error}</p>
          {/if}
        </div>

      {:else if currentStep === 2}
        <!-- Step 2: Alert Template Selection -->
        <div class="step-content">
          <p class="description">{steps[2].description}</p>
          <div class="templates-grid" role="radiogroup" aria-label="Select alert template">
            {#each templates as template (template)}
              <button
                class="template-card"
                class:selected={selectedTemplate === template.id}
                on:click={() => selectAlertTemplate(template.id)}
                role="radio"
                aria-checked={selectedTemplate === template.id}
                aria-label="{template.name} - {template.description}"
              >
                <div class="template-icon" aria-hidden="true">{template.icon}</div>
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
          <div class="notification-preview" role="img" aria-label="Example notification showing a large code deletion alert">
            <div class="preview-notification">
              <div class="preview-icon" aria-hidden="true">⚠️</div>
              <div class="preview-content">
                <strong>Large Code Deletion</strong>
                <p>AI deleted 150 lines in auth.js</p>
              </div>
            </div>
          </div>
          <div class="notification-buttons" role="group" aria-label="Notification preference">
            <button class="btn btn-primary" on:click={() => handleNotifications(true)} aria-label="Enable desktop notifications">
              Enable Notifications
            </button>
            <button class="btn btn-secondary" on:click={() => handleNotifications(false)} aria-label="Skip notifications setup">
              Skip for Now
            </button>
          </div>
          {#if error}
            <p class="error-message" role="alert">{error}</p>
          {/if}
        </div>

      {:else}
        <!-- Step 4: Complete -->
        <div class="step-content">
          <div class="success-icon" aria-hidden="true">✅</div>
          <p class="description">
            Raven is now monitoring all projects in <strong>{projectPath}</strong> and will alert you about important changes.
          </p>
          <div class="summary-box" role="region" aria-label="Setup summary">
            <h4>Your Configuration:</h4>
            <ul role="list">
              <li>Projects Folder: {projectPath}</li>
              <li>Alert Style: {templates.find(t => t.id === selectedTemplate)?.name || selectedTemplate}</li>
              <li>Notifications: {notificationsEnabled ? 'Enabled ✅' : 'Disabled (can enable later)'}</li>
            </ul>
          </div>
          {#if error}
            <p class="error-message" role="alert">{error}</p>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Footer -->
    <div class="wizard-footer" role="navigation" aria-label="Wizard navigation">
      {#if currentStep === 0}
        <button class="btn btn-secondary" on:click={skipWizard} aria-label="Skip setup wizard">
          Skip Setup
        </button>
        <button class="btn btn-primary" on:click={nextStep} aria-label="Start setup wizard">
          Get Started →
        </button>
      {:else if currentStep === 1}
        <button class="btn btn-secondary" on:click={prevStep} aria-label="Go to previous step">
          ← Back
        </button>
        <button class="btn btn-primary" on:click={selectProjectDirectory} aria-label="Continue to next step">
          Next →
        </button>
      {:else if currentStep === 2}
        <button class="btn btn-secondary" on:click={prevStep} aria-label="Go to previous step">
          ← Back
        </button>
        <span class="step-indicator" role="status">Selected: {templates.find(t => t.id === selectedTemplate)?.name}</span>
      {:else}
        <!-- Final step (3): Enable Notifications -->
        <button class="btn btn-secondary" on:click={prevStep} aria-label="Go to previous step">
          ← Back
        </button>
        <button
          class="btn btn-primary btn-lg"
          on:click={completeSetup}
          disabled={loading}
          aria-label={loading ? 'Setting up Raven' : 'Complete setup and start monitoring'}
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
    border-radius: var(--radius-sm);
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
    border-radius: var(--radius-sm) var(--radius-xl) 0 0;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--accent), var(--accent-2, var(--accent)));
    transition: width var(--duration-slow) var(--ease-smooth);
  }

  .wizard-header {
    padding: var(--space-xl) var(--space-4xl) var(--space-3xl);
    text-align: center;
    border-bottom: 1px solid var(--border);
  }

  .wizard-header h1 {
    margin: 0 0 var(--space-lg) 0;
    font-size: var(--icon-lg);
    font-weight: 700;
    color: var(--text);
  }

  .subtitle {
    margin: 0;
    font-size: 11px;
    color: var(--muted);
    font-weight: 500;
  }

  .wizard-content {
    padding: var(--space-xl) var(--space-4xl);
    flex: 1;
    overflow-y: auto;
  }

  .step-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .welcome-icon, .success-icon {
    font-size: 11px;
    text-align: center;
    margin: 0 auto;
  }

  .description {
    font-size: 11px;
    line-height: 1.6;
    color: var(--text);
    text-align: center;
    margin: 0;
  }

  .features-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    max-width: 500px;
    margin: 0 auto;
  }

  .feature {
    display: flex;
    align-items: center;
    gap: var(--space-xl);
    padding: var(--space-xl);
    background: var(--surface);
    border-radius: var(--radius);
  }

  .feature-icon {
    font-size: 11px;
    flex-shrink: 0;
  }

  .feature-text {
    font-size: 11px;
    color: var(--text);
    font-weight: 500;
  }

  .project-input {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .project-input label {
    font-size: 11px;
    font-weight: 600;
    color: var(--text);
  }

  /* (removed unused .path-input-group) */

  .project-input input {
    padding: var(--space-md) var(--space-lg);
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: var(--radius);
    color: var(--text);
    font-size: 12px;
    font-family: var(--mono);
    transition: border-color var(--duration-base) var(--ease-smooth);
  }

  .project-input input:focus {
    outline: none;
    border-color: var(--accent);
  }

  /* (removed unused .project-select styles) */

  /* (removed unused .selected-path) */

  /* (removed unused .loading-text) */

  .hint {
    font-size: 13px;
    color: var(--muted);
    margin: var(--space-sm) 0 0 0;
  }

  .templates-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--space-lg);
  }

  .template-card {
    padding: var(--space-lg);
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: var(--radius);
    cursor: pointer;
    transition: all var(--duration-base) var(--ease-smooth);
    text-align: center;
  }

  .template-card:hover {
    border-color: var(--accent);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .template-card:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .template-card.selected {
    border-color: var(--accent);
    background: var(--surface-2);
    box-shadow: 0 0 0 3px rgba(var(--accent-rgb, 59, 130, 246), 0.1);
  }

  .template-icon {
    font-size: 40px;
    margin-bottom: var(--space-xl);
  }

  .template-card h3 {
    margin: 0 0 var(--space-lg) 0;
    font-size: 11px;
    font-weight: 600;
    color: var(--text);
  }

  .template-card p {
    margin: 0 0 var(--space-md) 0;
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
    padding: var(--space-xl);
    background: var(--surface);
    border-radius: var(--radius);
    display: flex;
    justify-content: center;
  }

  .preview-notification {
    display: flex;
    gap: var(--space-xl);
    padding: var(--space-2xl);
    background: white;
    border: 2px solid #e5e7eb;
    border-radius: var(--radius);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    max-width: 350px;
  }

  .preview-icon {
    font-size: 11px;
    flex-shrink: 0;
  }

  .preview-content strong {
    display: block;
    font-size: 11px;
    font-weight: 600;
    color: #1f2937;
    margin-bottom: var(--space-sm);
  }

  .preview-content p {
    margin: 0;
    font-size: 13px;
    color: #6b7280;
  }

  .notification-buttons {
    display: flex;
    gap: var(--space-xl);
    justify-content: center;
  }

  .summary-box {
    padding: var(--space-lg);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .summary-box h4 {
    margin: 0 0 var(--space-md) 0;
    font-size: 11px;
    font-weight: 600;
    color: var(--text);
  }

  .summary-box ul {
    margin: 0;
    padding-left: 20px;
  }

  .summary-box li {
    font-size: 11px;
    color: var(--text);
    margin-bottom: var(--space-lg);
  }

  .error-message {
    padding: var(--space-xl);
    background: #fee2e2;
    border: 1px solid var(--error);
    border-radius: var(--radius-sm);
    color: var(--error);
    font-size: 11px;
    text-align: center;
    margin: 0;
  }

  .wizard-footer {
    padding: var(--space-lg) var(--space-4xl);
    border-top: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  /* Button styles removed - now using global .btn classes */

  .step-indicator {
    font-size: 13px;
    color: var(--muted);
  }
</style>
