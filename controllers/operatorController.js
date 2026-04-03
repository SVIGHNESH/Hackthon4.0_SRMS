const Operator = require('../models/Operator');
const Complaint = require('../models/Complaint');
const Municipal = require('../models/Municipal');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const cloudinary = require('cloudinary').v2;

let genAI;
try {
    const { GoogleGenerativeAI } = require("@google/generative-ai");
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
} catch (e) {
    console.log("Gemini AI not configured");
}

async function fetchImageAsBase64(imageUrl) {
    try {
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

        const token = jwt.sign({ id: operator._id }, process.env.JWT_SECRET);
        res.json({ success: true, operator, token });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getAssignedComplaints = async (req, res) => {
    try {
        const { municipality_id } = req.body;
        const complaints = await Complaint.find({ municipality_id, status: { $ne: "Solved" } });
        res.json({ success: true, complaints });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.verifyAndSolveComplaint = async (req, res) => {
    try {
        const { complaint_id, operator_image_url } = req.body;
        const complaint = await Complaint.findById(complaint_id);

        if (!complaint) return res.status(404).json({ success: false, message: "Complaint not found" });

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
                    geminiDecision = JSON.parse(responseText);
                } catch (e) {
                    console.log("Failed to parse Gemini response, using default");
                }
            }
        }

        if (geminiDecision.is_solved) {
            complaint.operatorImageUrl = operator_image_url;
            complaint.status = "Solved";
            complaint.geminiVerified = true;
            await complaint.save();

            if (complaint.municipality_id) {
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
        const complaint = await Complaint.findById(complaint_id);

        if (!complaint) return res.status(404).json({ success: false, message: "Complaint not found" });

        complaint.status = status;
        await complaint.save();

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
        
        const result = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                { folder: 'operator-evidence', resource_type: 'auto' },
                (error, result) => {
                    if (error) reject(error);
                    else resolve(result);
                }
            );
            uploadStream.end(file.buffer);
        });
        
        const complaint = await Complaint.findByIdAndUpdate(
            complaintId,
            {
                operatorImageUrl: result.secure_url,
                $push: { timeline: new Date() }
            },
            { new: true }
        );
        
        if (!complaint) {
            return res.status(404).json({ success: false, message: 'Complaint not found' });
        }
        
        res.json({ success: true, url: result.secure_url, complaint, message: 'Evidence uploaded successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};