import express from 'express';

const router = express.Router();
const delay = (ms) => new Promise(resolve=>setTimeout(resolve,ms));

router.get('/stream', async (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    
    res.write('<h1 class="stream-item">Loading Part 1...</h1>');
    res.write(`
        <style>
            .stream-item { font-family: sans-serif; color: #333; transition: all 0.3s; }
            .loading-state { animation: pulse 1s infinite; }
            @keyframes pulse { 0% { opacity: 0.1; } 50% { opacity: 2; } 100% { opacity: 0.1; } }
        </style>
    `);
    for(let i=2;i<=5;i++){
        await delay(i*1000);
        res.write(`<h1 class="stream-item" >Loading Part ${i}...</h1>`);
        
    }
    res.end(); // Tells the browser "Okay, I am finally done."
});

router.get('/stream1', async (req, res) => {
    res.setHeader('Content-Type', 'text/html');

    // 1. Inject your CSS styles first so the browser knows how to style incoming items
    res.write(`
        <style>
            .stream-item { font-family: sans-serif; color: #333; transition: all 0.3s; }
            .loading-state { animation: pulse 1s infinite; }
            @keyframes pulse { 0% { opacity: 0.1; } 50% { opacity: 2; } 100% { opacity: 0.1; } }
        </style>
    `);

    res.write('<h1 class="stream-item">Loading Something...</h1>');
    // ... rest of your loop
    res.end();
});

export default router;