// Intended for isolation of native fixtures; do not read or write to the user's actual terminal configuration.
localStorage.setItem('linux-note-terminal:v1:', JSON.stringify({profile:'powershell',confirm_multiline:false}));
