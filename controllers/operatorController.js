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

function bufferToDataUri(file) {
  const mimeType = file.mimetype || 'image/jpeg';
  const base64Data = file.buffer.toString('base64');
  return `data:${mimeType};base64,${base64Data}`;
}

function extractJsonObjectFromText(text) {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return trimmed.slice(start, end + 1);
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
    const CONFIDENCE_THRESHOLD = 70;

    if (!complaint_id || !complaint_id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ success: false, message: "Invalid complaint ID format" });
    }

    if (!operator_image_url) {
      return res.status(400).json({
        success: false,
        verified: false,
        confidence: 0,
        similarity: 0,
        threshold: CONFIDENCE_THRESHOLD,
        message: "operator_image_url is required"
      });
    }

    const complaint = await Complaint.findById(complaint_id);

    if (!complaint) return res.status(404).json({ success: false, message: "Complaint not found" });

    const operator = await Operator.findById(req.user.id);
    if (!operator) return res.status(401).json({ success: false, message: "Operator not found" });

    if (complaint.municipality_id && complaint.municipality_id.toString() !== operator.municipality_id?.toString()) {
      return res.status(403).json({ success: false, message: "You can only resolve complaints from your municipality" });
    }

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

    if (!normalizedOperatorImageUrl) {
      return res.status(400).json({
        success: false,
        verified: false,
        confidence: 0,
        similarity: 0,
        threshold: CONFIDENCE_THRESHOLD,
        message: "Invalid operator image URL"
      });
    }

    const previousStatus = complaint.status;
    complaint.operatorImageUrl = normalizedOperatorImageUrl;

    const persistAndRespondFailure = async (statusCode, message, similarity, reason) => {
      const safeSimilarity = Number.isFinite(similarity) ? Math.max(0, Math.min(100, similarity)) : 0;
      complaint.geminiVerified = false;
      complaint.verificationConfidence = safeSimilarity;
      complaint.verificationReason = reason;
      complaint.timeline.push({
        status: previousStatus,
        description: `Verification failed (${safeSimilarity}% similarity): ${reason}`,
        date: new Date()
      });
      await complaint.save();

      return res.status(statusCode).json({
        success: false,
        verified: false,
        confidence: safeSimilarity,
        similarity: safeSimilarity,
        threshold: CONFIDENCE_THRESHOLD,
        message,
        reason,
        complaintId: complaint._id
      });
    };

    if (!complaint.imageUrl) {
      return persistAndRespondFailure(
        400,
        "Complaint image not found. Cannot verify resolution.",
        0,
        "Citizen complaint image is missing"
      );
    }

    if (!genAI) {
      return persistAndRespondFailure(
        503,
        "AI verification service is unavailable.",
        0,
        "Gemini AI is not configured"
      );
    }

    const userImagePart = await fetchImageAsBase64(complaint.imageUrl);
    const operatorImagePart = await fetchImageAsBase64(normalizedOperatorImageUrl);

    if (!userImagePart || !operatorImagePart) {
      return persistAndRespondFailure(
        400,
        "Unable to fetch one or both images for verification.",
        0,
        "Image download failed or URL host is not allowed"
      );
    }

    let geminiDecision = {
      is_solved: false,
      confidence: 0,
      reason: "AI could not verify the resolution"
    };

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const prompt = `Image 1 is a civic complaint reported by a citizen. Image 2 is the resolution photo uploaded by the municipality operator.

Analyze both carefully and rate how confident you are that Image 2 shows the RESOLVED version of the issue in Image 1.

Respond ONLY with a JSON object in this exact format:
{ "is_solved": true/false, "confidence": 0-100, "reason": "brief explanation in 1-2 sentences" }

- Set "confidence" to a number between 0-100
- Set "is_solved" to true ONLY if both images show the same location AND the issue appears to be resolved
- "reason" should clearly explain why you think it's resolved or not`;

    let responseText = '';
    try {
      const result = await model.generateContent([prompt, userImagePart, operatorImagePart]);
      responseText = result.response.text();
    } catch (error) {
      console.error('Gemini API call failed:', error?.message || error);
      return persistAndRespondFailure(
        502,
        "Failed to call AI verification service.",
        0,
        "AI service request failed"
      );
    }

    try {
      const sanitized = responseText.replace(/^\`\`\`json\s*/i, "").replace(/\`\`\`$/i, "").trim();
      let parsed;

      try {
        parsed = JSON.parse(sanitized);
      } catch (parseError) {
        const extracted = extractJsonObjectFromText(sanitized);
        if (!extracted) throw parseError;
        parsed = JSON.parse(extracted);
      }

      geminiDecision = {
        is_solved: parsed.is_solved === true,
        confidence: Number(parsed.confidence),
        reason: typeof parsed.reason === 'string' && parsed.reason.trim()
          ? parsed.reason.trim()
          : "AI could not explain the verification result"
      };
    } catch (error) {
      console.error('Gemini response parse failed:', {
        error: error?.message || String(error),
        responsePreview: responseText ? responseText.slice(0, 600) : 'empty response'
      });
      return persistAndRespondFailure(
        502,
        "Failed to process AI verification response.",
        0,
        "AI response parsing failed"
      );
    }

    const similarity = Number.isFinite(geminiDecision.confidence)
      ? Math.max(0, Math.min(100, geminiDecision.confidence))
      : 0;
    const verified = geminiDecision.is_solved && similarity >= CONFIDENCE_THRESHOLD;

    complaint.geminiVerified = verified;
    complaint.verificationConfidence = similarity;
    complaint.verificationReason = geminiDecision.reason;

    if (verified) {
      complaint.status = "Solved";
      complaint.timeline.push({
        status: previousStatus,
        description: `AI verified resolution (${similarity}% similarity)`,
        date: new Date()
      });
      await complaint.save();

      if (previousStatus !== 'Solved' && complaint.municipality_id) {
        await Municipal.findByIdAndUpdate(complaint.municipality_id, {
          $inc: { solved: 1, pending: -1 }
        });
      }

      return res.json({
        success: true,
        verified: true,
        confidence: similarity,
        similarity,
        threshold: CONFIDENCE_THRESHOLD,
        message: "Issue verified and resolved successfully!",
        reason: geminiDecision.reason,
        complaint
      });
    }

    complaint.timeline.push({
      status: previousStatus,
      description: `Verification failed (${similarity}% similarity): ${geminiDecision.reason}`,
      date: new Date()
    });
    await complaint.save();

    return res.status(400).json({
      success: false,
      verified: false,
      confidence: similarity,
      similarity,
      threshold: CONFIDENCE_THRESHOLD,
      message: geminiDecision.is_solved
        ? `Low similarity (${similarity}%). Please provide clearer verification photo.`
        : "Images don't match. The verification photo doesn't show the resolved issue.",
      reason: geminiDecision.reason,
      complaintId: complaint._id
    });
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

    let operatorImageUrl = '';
    if (file.buffer) {
      operatorImageUrl = bufferToDataUri(file);
    } else if (file.path) {
      try {
        const uploadResult = await cloudinary.uploader.upload(file.path, {
          folder: 'operator-evidence',
          resource_type: 'auto'
        });
        operatorImageUrl = uploadResult.secure_url;
      } catch (error) {
        if (error && error.http_code === 403) {
          return res.status(502).json({
            success: false,
            message: 'Cloudinary rejected the upload. Check CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_SECRET_KEY.'
          });
        }
        throw error;
      }
    }

    if (!operatorImageUrl) {
      return res.status(500).json({ success: false, message: 'Operator image upload failed' });
    }

    complaint.operatorImageUrl = operatorImageUrl;
    await complaint.save();

    res.json({ success: true, url: operatorImageUrl, complaint, message: 'Evidence uploaded successfully' });
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
