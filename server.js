const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;
const DB_FILE = './database.json';

// Middleware
app.use(cors());
app.use(express.json());
// Analytics Logic
const ANALYTICS_FILE = './analytics.json';
function getAnalytics() {
    if (!fs.existsSync(ANALYTICS_FILE)) return { total_visits: 0, paths: {}, last_visits: [] };
    return JSON.parse(fs.readFileSync(ANALYTICS_FILE, 'utf8'));
}
function saveAnalytics(data) {
    fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(data, null, 2));
}

app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.includes('.')) {
        // Log simple requests like / or /dashboard
        const stats = getAnalytics();
        stats.total_visits++;
        
        let p = req.path;
        if (p === '/') p = '/index.html';
        
        stats.paths[p] = (stats.paths[p] || 0) + 1;
        
        // Keep last 20 visits for a live feed
        stats.last_visits.unshift({
            time: new Date().toISOString(),
            path: p,
            userAgent: req.headers['user-agent']
        });
        if (stats.last_visits.length > 20) stats.last_visits.pop();
        
        saveAnalytics(stats);
    } else if (req.method === 'GET' && (req.path === '/index.html' || req.path === '/dashboard.html')) {
        const stats = getAnalytics();
        stats.total_visits++;
        stats.paths[req.path] = (stats.paths[req.path] || 0) + 1;
        saveAnalytics(stats);
    }
    next();
});

app.get('/api/admin/stats', (req, res) => {
    res.json(getAnalytics());
});

app.use(express.static(path.join(__dirname, 'public')));

function getDB() {
    if (!fs.existsSync(DB_FILE)) return { waitlist: [], ideas: [] };
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}
function saveDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// 1. Waitlist
app.post('/api/waitlist', (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });
    const db = getDB();
    if (db.waitlist.includes(email)) return res.status(400).json({ error: "Email already on waitlist!" });
    db.waitlist.push(email);
    saveDB(db);
    res.json({ message: "Successfully joined waitlist in our Database!", id: db.waitlist.length });
});

// 2. Legacy Ideas (Dropdown)
app.get('/api/ideas', (req, res) => {
    const budget = req.query.budget ? parseInt(req.query.budget) : 1000000;
    const niche = req.query.niche || 'All';
    const db = getDB();
    let matchingIdeas = db.ideas.filter(idea => idea.min_budget <= budget);
    if (niche !== 'All') {
        matchingIdeas = matchingIdeas.filter(idea => idea.niche === niche);
    }
    res.json({ ideas: matchingIdeas });
});

// 3. NEW: AI Generative Engine (ChatGPT style)
app.post('/api/ai-ideas', (req, res) => {
    const { prompt } = req.body;
    const lowerPrompt = (prompt || "").toLowerCase();
    
    // Extract keywords from prompt (ignore common stop words)
    const stopWords = ["i", "am", "a", "an", "the", "and", "or", "but", "in", "on", "with", "to", "for", "of", "want", "have", "my", "is", "this", "that"];
    const keywords = lowerPrompt.replace(/[^a-z0-9 ]/g, '').split(' ').filter(w => w.length > 2 && !stopWords.includes(w));

    const db = getDB();
    
    // Keyword Scoring Algorithm
    let scoredIdeas = db.ideas.map(idea => {
        let score = 0;
        const targetStr = (idea.title + " " + idea.description + " " + idea.niche + " " + idea.category).toLowerCase();
        
        keywords.forEach(kw => {
            if (idea.title.toLowerCase().includes(kw)) score += 5; // Title match is highly relevant
            else if (idea.niche.toLowerCase().includes(kw)) score += 3;
            else if (targetStr.includes(kw)) score += 1;
        });
        
        return { ...idea, score };
    });

    // Sort by highest score, then fallback to random if scores are tied at 0
    scoredIdeas = scoredIdeas.sort((a, b) => b.score - a.score || (0.5 - Math.random()));
    const topIdeas = scoredIdeas.slice(0, 3);
    
    // Determine detected niche for the UI
    const detectedNiche = topIdeas[0].score > 0 ? topIdeas[0].niche : "General Business";

    let aiResponse = `<p class="mb-6 text-lg text-slate-700">I analyzed your specific keywords and scanned 300+ business models. Based on your profile, here are the 3 most highly-correlated businesses you should start:</p>`;
    
    topIdeas.forEach((idea, idx) => {
        aiResponse += `
        <div class="mb-8 p-8 bg-white rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition">
            <div class="flex items-center justify-between mb-4">
                <h3 class="font-bold text-2xl text-slate-900">${idx + 1}. ${idea.title}</h3>
                <span class="bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1 rounded-full">Min Budget: ₹${idea.min_budget}</span>
            </div>
            <p class="text-slate-600 mb-6 text-lg">${idea.description}</p>
            <div class="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                <strong class="text-slate-900 block mb-3 text-lg"><i class="fa-solid fa-wand-magic-sparkles text-blue-600 mr-2"></i>Srijan AI Execution Strategy:</strong>
                ${idea.strategy_html}
            </div>
        </div>`;
    });

    aiResponse += `<div class="bg-emerald-50 border border-emerald-200 p-6 rounded-2xl text-emerald-800 font-medium">To begin execution on any of these, move to the <strong>30-Day Sprint</strong> tab in your navigation bar.</div>`;

    setTimeout(() => {
        res.json({ response: aiResponse });
    }, 1500);
});

// 4. Secure Payment Gateway Simulation
app.post('/api/create-order', async (req, res) => {
    try {
        const Razorpay = require('razorpay');
        const rzp = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder',
            key_secret: process.env.RAZORPAY_KEY_SECRET || 'secret_placeholder'
        });

        const options = {
            amount: 999 * 100, // ₹999 in paise
            currency: "INR",
            receipt: "receipt_order_" + Date.now()
        };

        const order = await rzp.orders.create(options);
        res.json({ success: true, order });
    } catch (error) {
        console.error("Razorpay Order Error:", error);
        res.status(500).json({ error: "Failed to create payment order." });
    }
});

app.post('/api/verify-payment', (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const secret = process.env.RAZORPAY_KEY_SECRET || 'secret_placeholder';
    
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = require('crypto')
        .createHmac("sha256", secret)
        .update(body.toString())
        .digest("hex");
        
    if (expectedSignature === razorpay_signature) {
        // In a real app, update DB to PRO here
        res.json({ success: true, message: "Payment verified successfully!" });
    } else {
        res.status(400).json({ success: false, error: "Invalid signature" });
    }
});

// 5. User Authentication & Sprint Persistence
app.post('/api/login', (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });
    
    const db = getDB();
    if (!db.users) db.users = [];
    
    let user = db.users.find(u => u.email === email.toLowerCase());
    if (!user) {
        // Create new user
        user = { email: email.toLowerCase(), sprintProgress: [] };
        db.users.push(user);
        saveDB(db);
    }
    
    res.json({ success: true, user });
});

app.post('/api/sprint', (req, res) => {
    const { email, progress } = req.body;
    if (!email) return res.status(400).json({ error: "Unauthorized" });
    
    const db = getDB();
    if (!db.users) db.users = [];
    
    let user = db.users.find(u => u.email === email.toLowerCase());
    if (user) {
        user.sprintProgress = progress;
        saveDB(db);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: "User not found" });
    }
});

// Load .env file manually without external dependencies
let GEMINI_API_KEY = process.env.GEMINI_API_KEY || null;
try {
    const envFile = fs.readFileSync('.env', 'utf8');
    const match = envFile.match(/GEMINI_API_KEY=(.*)/);
    if (match && match[1] !== 'paste_your_real_key_here') {
        GEMINI_API_KEY = GEMINI_API_KEY || match[1].trim();
    }
} catch (e) {}

app.post('/api/business-plan', async (req, res) => {
    const { idea } = req.body;
    if (!GEMINI_API_KEY) {
        return res.json({ error: "Gemini API Key missing. Add it to Render Environment Variables." });
    }

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                system_instruction: {
                    parts: { text: "You are an elite business planner for Indian startups. Generate a highly detailed, 10-page equivalent business plan in Markdown format. Include: Executive Summary, Market Analysis (Indian context), Monetization Strategy, Go-To-Market Plan, and Technical Architecture." }
                },
                contents: [{ parts: [{ text: `Generate a comprehensive business plan for this startup idea: ${idea}` }] }]
            })
        });
        
        const data = await response.json();
        if (data.candidates && data.candidates[0].content) {
            res.json({ plan: data.candidates[0].content.parts[0].text });
        } else {
            res.json({ error: "Failed to generate plan." });
        }
    } catch (error) {
        res.json({ error: "Network error while reaching Google AI." });
    }
});

// 6. True Generative AI Mentor Chatbot (LLM Integration)
app.post('/api/chat', async (req, res) => {
    const { message } = req.body;
    let aiResponse = "";
    let usingFallback = false;
    
    // If user has provided a real API key, use TRUE Generative AI
    if (GEMINI_API_KEY) {
        try {
            // Using a standard Gemini endpoint 
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/deep-research-preview-04-2026:generateContent?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    system_instruction: {
                        parts: { text: "You are Srijan AI, an elite business mentor for Indian entrepreneurs. Keep your answers under 3 sentences. Be practical, highly strategic, and focus on the Indian market." }
                    },
                    contents: [{ parts: [{ text: message }] }]
                })
            });
            
            const data = await response.json();
            if (data.candidates && data.candidates[0].content) {
                return res.json({ reply: data.candidates[0].content.parts[0].text });
            } else if (data.error && data.error.code === 429) {
                // Quota exceeded
                usingFallback = true;
                aiResponse = "[Google AI Quota Exhausted: Falling back to Local Engine] ";
            } else {
                usingFallback = true;
                aiResponse = "[Google AI Error: Falling back to Local Engine] ";
            }
        } catch (error) {
            usingFallback = true;
            aiResponse = "[Google AI Network Error: Falling back to Local Engine] ";
        }
    } else {
        usingFallback = true;
        aiResponse = "[SIMULATION MODE: Please add a Gemini API key to your .env file] ";
    }

    // FALLBACK ENGINE
    if (usingFallback) {
        const lowerMsg = (message || "").toLowerCase();
        
        if (lowerMsg.includes("gst") || lowerMsg.includes("tax") || lowerMsg.includes("register") || lowerMsg.includes("legal")) {
            aiResponse += "For businesses in India, GST registration is only mandatory if your turnover exceeds ₹40 Lakhs (or ₹20 Lakhs for services). For now, I recommend registering as a Sole Proprietorship with an MSME Udyam Certificate. It takes 10 minutes and is completely free. Should we add 'Udyam Registration' to your Sprint?";
        } else if (lowerMsg.includes("fund") || lowerMsg.includes("loan") || lowerMsg.includes("money") || lowerMsg.includes("invest")) {
            aiResponse += "If you need capital, avoid giving away equity early. SrijanOS integrates directly with the Govt's Mudra Loan scheme (up to ₹10 Lakhs collateral-free). Check the 'Govt Schemes' tab to see your eligibility. If you need larger venture capital, I can help you draft a pitch deck.";
        } else if (lowerMsg.includes("marketing") || lowerMsg.includes("sales") || lowerMsg.includes("customers") || lowerMsg.includes("client")) {
            aiResponse += "In India, WhatsApp marketing has a 98% open rate compared to 20% for email. For your first 100 customers, I highly recommend creating a WhatsApp Business catalog and running localized Facebook Lead Ads for ₹200/day. Have you identified your target audience yet?";
        } else if (lowerMsg.includes("idea") || lowerMsg.includes("don't know") || lowerMsg.includes("what to build")) {
            aiResponse += "Don't stress. Go to the 'Idea Engine' tab and use our AI Generator. We have 300+ validated business models specifically for the Indian market. Once you pick one, come back here and I will help you execute the first step.";
        } else if (lowerMsg.includes("code") || lowerMsg.includes("tech") || lowerMsg.includes("app") || lowerMsg.includes("website")) {
            aiResponse += "You don't need a technical co-founder immediately. Use no-code tools like Bubble or FlutterFlow to build your MVP in a weekend. If you absolutely need a developer, go to our 'Skill Barter' tab and trade some of your skills for a developer's time.";
        } else {
            const responses = [
                "That's a strategic question. In the early days, execution is more important than perfection. What is the biggest bottleneck preventing you from launching this week?",
                "Interesting approach. Have you validated this assumption with at least 5 potential paying customers?",
                "As your AI Co-founder, I advise against over-optimizing right now. Focus on the core value proposition. Let's look at your 30-Day Sprint board—are you on track?"
            ];
            aiResponse += responses[Math.floor(Math.random() * responses.length)];
        }

        setTimeout(() => {
            res.json({ reply: aiResponse });
        }, 1500); 
    }
});

// 7. Profile Editor & Skill Barter Network
app.post('/api/profile', (req, res) => {
    const { email, name, role, offer, need } = req.body;
    if (!email) return res.status(400).json({ error: "Unauthorized" });
    
    const db = getDB();
    if (!db.users) db.users = [];
    
    let user = db.users.find(u => u.email === email.toLowerCase());
    if (user) {
        user.name = name;
        user.role = role;
        user.offer = offer;
        user.need = need;
        saveDB(db);
        res.json({ success: true, user });
    } else {
        res.status(404).json({ error: "User not found" });
    }
});

app.get('/api/profiles', (req, res) => {
    const db = getDB();
    if (!db.users) return res.json({ profiles: [] });
    
    // Filter only users who have filled out their barter profiles
    const profiles = db.users.filter(u => u.role && u.offer && u.need).map(u => ({
        name: u.name || u.email.split('@')[0],
        role: u.role,
        offer: u.offer,
        need: u.need
    }));
    
    res.json({ profiles });
});

app.listen(PORT, () => {
    console.log(`🚀 Srijan Backend Server is LIVE at http://localhost:${PORT}`);
});
