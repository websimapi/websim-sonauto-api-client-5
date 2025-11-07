import * as api from './api.js';
import * as ui from './ui.js';

const POLLING_INTERVAL = 5000; // 5 seconds
const room = window.room;

function getTokenFromQuery() {
  const params = new URLSearchParams(window.location.search);
  return params.get('token') || params.get('challenge') || null;
}

async function handleAuthorization(challengeTokenFromUrl = null) {
    ui.setAuthLoading(true);
    ui.updateAuthStatus('Requesting challenge...');
    ui.logMessage('Starting authorization...');
    try {
        let challengeToken = challengeTokenFromUrl;
        if (!challengeToken) {
            const challengeData = await api.getChallenge();
            challengeToken = challengeData.challenge_token;
            if (!challengeToken) {
                throw new Error('Could not retrieve challenge token from server.');
            }
            ui.logMessage('Received challenge token from server.');
        } else {
            ui.logMessage('Using challenge token from URL.');
        }

        ui.updateAuthStatus('Waiting for you to authorize...');
        ui.logMessage('Creating database record for authorization...');

        await room.collection('auth_challenge_v1').create({ token: challengeToken });
        ui.logSuccess('Authorization record created successfully.');

        const currentUser = await window.websim.getCurrentUser();
        if (!currentUser || !currentUser.username) {
            throw new Error('Could not get current user information.');
        }

        ui.updateAuthStatus('Verifying authorization...');
        ui.logMessage(`Verifying as user: ${currentUser.username}`);

        // Retry verification a few times to allow for db replication delay
        let verificationResult;
        for (let i = 0; i < 5; i++) {
            try {
                verificationResult = await api.verifyChallenge(challengeToken, currentUser.username);
                if (verificationResult.access_token) break;
            } catch (e) {
                if (i === 4) throw e; // throw last error
                ui.logMessage(`Verification attempt ${i + 1} failed, retrying...`);
                await new Promise(res => setTimeout(res, 1000)); // wait 1s
            }
        }
        
        if (verificationResult && verificationResult.access_token) {
            api.setAccessToken(verificationResult.access_token);
            ui.logSuccess('Authorization successful!');
            ui.updateAuthStatus(`Authorized as ${currentUser.username}`, 'success');
            return true;
        } else {
            throw new Error('Verification failed. Could not get access token.');
        }
    } catch (error) {
        ui.logError(`Authorization failed: ${error.message}`);
        ui.updateAuthStatus('Authorization Failed', 'error');
        return false;
    } finally {
        ui.setLoading(false);
    }
}

async function handleGenerateSubmit(event) {
    event.preventDefault();
    
    if (!api.getAccessToken()) {
        ui.logMessage('Authorization required before generating a song.');
        const authorized = await handleAuthorization();
        if (!authorized) {
            ui.logError('Cannot generate song without authorization.');
            return;
        }
    }

    const params = ui.getGenerateFormParams();
    
    ui.setLoading(true);
    ui.logMessage('Starting song generation...');
    
    try {
        const data = await api.generateSong(params);
        if (data.task_id) {
            ui.logMessage(`Generation task started successfully. Task ID: <span class="task-id">${data.task_id}</span>`);
            pollForStatus(data.task_id);
        } else {
            ui.logError(`Failed to start generation. Response: ${JSON.stringify(data)}`);
        }
    } catch (error) {
        ui.logError(`Error generating song: ${error.message}`);
    } finally {
        ui.setLoading(false);
    }
}

function pollForStatus(taskId) {
    ui.logMessage(`Polling for status of task <span class="task-id">${taskId}</span>...`);
    
    const intervalId = setInterval(async () => {
        try {
            const result = await api.getGeneration(taskId);
            if (result.status === 'SUCCESS') {
                clearInterval(intervalId);
                ui.logSuccess(`Task <span class="task-id">${taskId}</span> completed!`);
                ui.displaySongs(taskId, result.song_paths);
            } else if (result.status === 'FAILURE') {
                clearInterval(intervalId);
                ui.logError(`Task <span class="task-id">${taskId}</span> failed. Reason: ${result.error_message}`);
            } else {
                 ui.updateTaskStatus(taskId, result.status);
            }
        } catch (error) {
            clearInterval(intervalId);
            ui.logError(`Error polling for task <span class="task-id">${taskId}</span>: ${error.message}`);
        }
    }, POLLING_INTERVAL);
}

async function handleStatusSubmit(event) {
    event.preventDefault();

    const taskId = ui.getTaskId();
    if (!taskId) {
        ui.logError('Please enter a Task ID.');
        return;
    }
    
    ui.setLoading(true);
    try {
        const result = await api.getGeneration(taskId);
        if (result.status === 'SUCCESS') {
            ui.logSuccess(`Task <span class="task-id">${taskId}</span> completed!`);
            ui.displaySongs(taskId, result.song_paths);
        } else if (result.status === 'FAILURE') {
            ui.logError(`Task <span class="task-id">${taskId}</span> failed. Reason: ${result.error_message}`);
        } else {
            ui.logMessage(`Task <span class="task-id">${taskId}</span> status: <span class="status">${result.status}</span>`);
            pollForStatus(taskId);
        }
    } catch (error) {
        ui.logError(`Error checking status for task <span class="task-id">${taskId}</span>: ${error.message}`);
    } finally {
        ui.setLoading(false);
    }
}

function handleTabClick(event) {
    if (event.target.classList.contains('tab-link')) {
        ui.setActiveTab(event.target.dataset.tab);
    }
}

async function init() {
    document.getElementById('generate-form').addEventListener('submit', handleGenerateSubmit);
    document.getElementById('status-form').addEventListener('submit', handleStatusSubmit);
    document.querySelector('.tab-nav').addEventListener('click', handleTabClick);
    ui.clearLogs();
    
    const tokenFromUrl = getTokenFromQuery();
    if (tokenFromUrl) {
        await handleAuthorization(tokenFromUrl);
    } else {
         ui.updateAuthStatus('Not Authorized', 'error');
    }
}

init();