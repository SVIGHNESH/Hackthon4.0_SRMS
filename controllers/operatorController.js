const Operator = require('../models/Operator');
const Complaint = require('../models/Complaint');
const Municipal = require('../models/Municipal');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const cloudinary = require('cloudinary').v2;
const { normaliseStatus } = require('../utils/statusHelper');

let genAI;
try {
    const { GoogleGenerativeAI } = require("@google/generative-ai");
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
} catch (e) {
    console.log("Gemini AI not configured");
}

const ALLOWED_IMAGE_HOSTS = ['res.cloudinary.com', 'cloudinary.com'];

async function fetchImageAsBase64(imageUrl) {
    try {
        const urlObj = new URL(imageUrl);
        
        if (!ALLOWED_IMAGE_HOSTS.includes(urlObj.hostname)) {
            console.error(`SSRF blocked: Invalid hostname ${urlObj.hostname} in image URL`);
            return null;
        }
        
        const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        const base64 = Buffer.from(response.data).toString('base64');
        const mimeType = response.headers['content-type'] || 'image/jpeg';
        return {
            inlineData: {
                data: base64,
                mimeType: mimeType
            }
        };
    } catch (error) {
        console.error("Error fetching image:", error);
        return null;
    }
}

exports.operatorLogin = async (req, res) => {
    try {
        const { username, password } = req.body;
        
        const operator = await Operator.findOne({ official_username: username });
        if (!operator) return res.status(401).json({ success: false, message: "Operator not found" });

        const isMatch = await bcrypt.compare(password, operator.hashed_password);
        if (!isMatch) return res.status(401).json({ success: false, message: "Invalid password" });

        const token = jwt.sign({ id: operator._id }, process.env.JWT_SECRET, { expiresIn: "8h" });
        const { hashed_password, ...safeOperator } = operator.toObject();
        res.json({ success: true, operator: safeOperator, token });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getAssignedComplaints = async (req, res) => {
    try {
        const operator = await Operator.findById(req.user.id);
        if (!operator) return res.status(401).json({ success: false, message: "Operator not found" });
        
        const municipalityId = operator.municipality_id;
        const complaints = await Complaint.find({ municipality_id: municipalityId, status: { $ne: "Solved" } });
        res.json({ success: true, complaints });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.verifyAndSolveComplaint = async (req, res) => {
    try {
        const { complaint_id, operator_image_url } = req.body;
        
        if (!complaint_id || !complaint_id.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ success: false, message: "Invalid complaint ID format" });
        }
        
        const complaint = await Complaint.findById(complaint_id);

        if (!complaint) return res.status(404).json({ success: false, message: "Complaint not found" });

        const operator = await Operator.findById(req.user.id);
        if (!operator) return res.status(401).json({ success: false, message: "Operator not found" });

        if (complaint.municipality_id && complaint.municipality_id.toString() !== operator.municipality_id?.toString()) {
            return res.status(403).json({ success: false, message: "You can only resolve complaints from your municipality" });
        }

        let geminiDecision = { is_solved: true, reason: "Manual verification" };

        if (genAI && complaint.imageUrl && operator_image_url) {
            const userImagePart = await fetchImageAsBase64(complaint.imageUrl);
            const operatorImagePart = await fetchImageAsBase64(operator_image_url);

            if (userImagePart && operatorImagePart) {
                const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                const prompt = "Image 1 is a civic complaint reported by a citizen. Image 2 is the resolution photo uploaded by the municipality operator. Analyze both carefully. Has the issue shown in Image 1 been successfully fixed in Image 2? Respond ONLY with a JSON object: { \"is_solved\": true/false, \"reason\": \"brief explanation\" }";

                const result = await model.generateContent([prompt, userImagePart, operatorImagePart]);
                const responseText = result.response.text();
                
                try {
                    const sanitized = responseText.replace(/^\`\`\`json\s*/i, "").replace(/\`\`\`$/i, "").trim();
                    geminiDecision = JSON.parse(sanitized);
                } catch (e) {
                    console.log("Failed to parse Gemini response, defaulting to is_solved: false for safety");
                    geminiDecision = { is_solved: false, reason: "Failed to parse AI response" };
                }
            }
        }

        if (geminiDecision.is_solved) {
            const previousStatus = complaint.status;
            complaint.operatorImageUrl = operator_image_url;
            complaint.status = "Solved";
            complaint.geminiVerified = true;
            complaint.timeline.push({ status: previousStatus, description: 'AI verified resolution', date: new Date() });
            await complaint.save();

            if (previousStatus !== 'Solved' && complaint.municipality_id) {
                await Municipal.findByIdAndUpdate(complaint.municipality_id, {
                    $inc: { solved: 1, pending: -1 }
                });
            }

            return res.json({ success: true, message: "AI verified issue is solved!", complaint });
        } else {
            return res.status(400).json({ success: false, message: "AI rejected resolution.", reason: geminiDecision.reason });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.updateComplaintStatus = async (req, res) => {
    try {
        const { complaint_id, status } = req.body;
        
        if (!complaint_id || !complaint_id.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ success: false, message: "Invalid complaint ID format" });
        }
        
        const complaint = await Complaint.findById(complaint_id);

        if (!complaint) return res.status(404).json({ success: false, message: "Complaint not found" });

        const operator = await Operator.findById(req.user.id);
        if (!operator) return res.status(401).json({ success: false, message: "Operator not found" });

        if (complaint.municipality_id && complaint.municipality_id.toString() !== operator.municipality_id?.toString()) {
            return res.status(403).json({ success: false, message: "You can only update complaints from your municipality" });
        }

        const previousStatus = complaint.status;
        const normalizedStatus = normaliseStatus(status);
        complaint.status = normalizedStatus;
        complaint.timeline.push({ status: previousStatus, description: `Status changed to ${normalizedStatus}`, date: new Date() });
        await complaint.save();

        if (previousStatus !== 'Solved' && normalizedStatus === 'Solved') {
            await Municipal.findByIdAndUpdate(complaint.municipality_id, { $inc: { solved: 1, pending: -1 } });
        }

        res.json({ success: true, complaint });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.uploadOperatorEvidence = async (req, res) => {
    try {
        const { complaintId } = req.body;
        const file = req.file;
        
        if (!file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }
        
        const complaint = await Complaint.findById(complaintId);
        if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found' });
        
        const operator = await Operator.findById(req.user.id);
        if (!operator) return res.status(401).json({ success: false, message: "Operator not found" });

        if (complaint.municipality_id && complaint.municipality_id.toString() !== operator.municipality_id?.toString()) {
            return res.status(403).json({ success: false, message: "You can only upload evidence for complaints from your municipality" });
        }
        
        await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                { folder: 'operator-evidence', resource_type: 'auto' },
                (error, result) => {
                    if (error) reject(error);
                    else resolve(result);
                }
            );
            uploadStream.end(file.buffer);
        });
        
        complaint.operatorImageUrl = result.secure_url;
        await complaint.save();
        
        res.json({ success: true, url: result.secure_url, complaint, message: 'Evidence uploaded successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};