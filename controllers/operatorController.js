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

function parseDataUriImage(imageUrl) {
  if (!imageUrl) return null;
  const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  const mimeType = match[1] || 'image/jpeg';
  const base64Data = match[2];
  return { mimeType, base64Data };
}

async function fetchImageAsBase64(imageUrl) {
  try {
    if (!imageUrl) return null;

    if (imageUrl.startsWith('data:')) {
      const parsed = parseDataUriImage(imageUrl);
      if (!parsed) {
        console.error('Invalid data URI format for image');
        return null;
      }

      return {
        inlineData: {
          data: parsed.base64Data,
          mimeType: parsed.mimeType
        }
      };
    }

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

async function uploadBase64ToCloudinary(base64Data, mimeType, folder) {
  const dataUri = `data:${mimeType || 'image/jpeg'};base64,${base64Data}`;
  return cloudinary.uploader.upload(dataUri, {
    folder,
    resource_type: 'auto'
  });
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
    if (!municipalityId) {
      return res.status(400).json({ success: false, message: "Operator has no municipality assigned" });
    }

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

    // Default values for manual verification (no AI)
    let geminiDecision = { is_solved: true, confidence: 100, reason: "Manual verification" };

    let normalizedOperatorImageUrl = operator_image_url;
    if (operator_image_url && operator_image_url.startsWith('data:')) {
      const parsed = parseDataUriImage(operator_image_url);
      if (!parsed) {
        return res.status(400).json({
          success: false,
          message: 'Invalid base64 image format for operator image'
        });
      }

      try {
        const uploadResult = await uploadBase64ToCloudinary(
          parsed.base64Data,
          parsed.mimeType,
          'operator-evidence'
        );
        if (uploadResult && uploadResult.secure_url) {
          normalizedOperatorImageUrl = uploadResult.secure_url;
        }
      } catch (e) {
        console.error('Cloudinary upload failed for base64 operator image:', e);
        return res.status(500).json({
          success: false,
          message: 'Cloudinary upload failed for operator image'
        });
      }
    }

    // Use Gemini AI for image comparison
    if (genAI && complaint.imageUrl && normalizedOperatorImageUrl) {
      const userImagePart = await fetchImageAsBase64(complaint.imageUrl);
      const operatorImagePart = await fetchImageAsBase64(normalizedOperatorImageUrl);

      if (userImagePart && operatorImagePart) {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = `Image 1 is a civic complaint reported by a citizen. Image 2 is the resolution photo uploaded by the municipality operator.

Analyze both carefully and rate how confident you are that Image 2 shows the RESOLVED version of the issue in Image 1.

Respond ONLY with a JSON object in this exact format:
{ "is_solved": true/false, "confidence": 0-100, "reason": "brief explanation in 1-2 sentences" }

- Set "confidence" to a number between 0-100
- Set "is_solved" to true ONLY if both images show the same location AND the issue appears to be resolved
- "reason" should clearly explain why you think it's resolved or not`;

        const result = await model.generateContent([prompt, userImagePart, operatorImagePart]);
        const responseText = result.response.text();

        try {
          const sanitized = responseText.replace(/^\`\`\`json\s*/i, "").replace(/\`\`\`$/i, "").trim();
          geminiDecision = JSON.parse(sanitized);
        } catch (e) {
          console.log("Failed to parse Gemini response, defaulting to is_solved: false for safety");
          geminiDecision = { is_solved: false, confidence: 0, reason: "Failed to parse AI response. Please try again." };
        }
      }
    }

    // Use 70% confidence threshold for auto-verification
    const CONFIDENCE_THRESHOLD = 70;

    if (geminiDecision.is_solved && geminiDecision.confidence >= CONFIDENCE_THRESHOLD) {
      const previousStatus = complaint.status;
      complaint.operatorImageUrl = normalizedOperatorImageUrl;
      complaint.status = "Solved";
      complaint.geminiVerified = true;
      complaint.verificationConfidence = geminiDecision.confidence;
      complaint.verificationReason = geminiDecision.reason;
      complaint.timeline.push({ status: previousStatus, description: `AI verified resolution (${geminiDecision.confidence}% confidence)`, date: new Date() });
      await complaint.save();

      if (previousStatus !== 'Solved' && complaint.municipality_id) {
        await Municipal.findByIdAndUpdate(complaint.municipality_id, {
          $inc: { solved: 1, pending: -1 }
        });
      }

      return res.json({
        success: true,
        message: "Issue verified and resolved successfully!",
        confidence: geminiDecision.confidence,
        reason: geminiDecision.reason,
        complaint
      });
    } else {
      return res.status(400).json({
        success: false,
        message: geminiDecision.is_solved
          ? `Low confidence (${geminiDecision.confidence}%). Please provide clearer verification photo.`
          : "Images don't match. The verification photo doesn't show the resolved issue.",
        confidence: geminiDecision.confidence || 0,
        reason: geminiDecision.reason || "AI could not verify the resolution"
      });
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

exports.getOperatorStats = async (req, res) => {
  try {
    const operator = await Operator.findById(req.user.id);
    if (!operator) return res.status(401).json({ success: false, message: "Operator not found" });

    if (!operator.municipality_id) {
      return res.status(400).json({ success: false, message: "No municipality assigned" });
    }

    const municipalityId = operator.municipality_id;

    // Fetch ALL complaints, not just non-solved
    const all = await Complaint.find({ municipality_id: municipalityId });

    const stats = {
      total: all.length,
      pending: all.filter(c => c.status === 'Pending').length,
      inProgress: all.filter(c => c.status === 'In Progress').length,
      solved: all.filter(c => c.status === 'Solved').length,
      escalated: all.filter(c => c.status === 'Escalated').length,
    };

    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.uploadOperatorEvidence = async (req, res) => {
  try {
    const { complaintId } = req.body;
    const file = req.file;

    if (!complaintId || !complaintId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ success: false, message: 'Invalid complaint ID format' });
    }

    if (!file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    if (!file.buffer && !file.path) {
      return res.status(400).json({ success: false, message: 'Uploaded file data is missing' });
    }

    const complaint = await Complaint.findById(complaintId);
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found' });

    const operator = await Operator.findById(req.user.id);
    if (!operator) return res.status(401).json({ success: false, message: "Operator not found" });

    if (complaint.municipality_id && complaint.municipality_id.toString() !== operator.municipality_id?.toString()) {
      return res.status(403).json({ success: false, message: "You can only upload evidence for complaints from your municipality" });
    }

    let uploadResult;
    if (file.buffer) {
      uploadResult = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          { folder: 'operator-evidence', resource_type: 'auto' },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        uploadStream.end(file.buffer);
      });
    } else {
      uploadResult = await cloudinary.uploader.upload(file.path, {
        folder: 'operator-evidence',
        resource_type: 'auto'
      });
    }

    if (!uploadResult || !uploadResult.secure_url) {
      return res.status(500).json({ success: false, message: 'Cloudinary upload failed' });
    }

    complaint.operatorImageUrl = uploadResult.secure_url;
    await complaint.save();

    res.json({ success: true, url: uploadResult.secure_url, complaint, message: 'Evidence uploaded successfully' });
  } catch (error) {
    console.error('uploadOperatorEvidence error:', error);
    if (error && error.http_code === 403) {
      return res.status(502).json({
        success: false,
        message: 'Cloudinary rejected the upload. Check CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_SECRET_KEY.'
      });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.cloudinaryHealth = async (req, res) => {
  try {
    const result = await cloudinary.api.ping();
    res.json({ success: true, result });
  } catch (error) {
    console.error('cloudinaryHealth error:', error);
    res.status(503).json({
      success: false,
      message: 'Cloudinary is not reachable or credentials are invalid',
      error: error.message || 'Unknown error'
    });
  }
};
