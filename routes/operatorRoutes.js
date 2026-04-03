const express = require('express');
const multer = require('multer');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});
const authMiddleware = require('../middleware/auth');
const {
  operatorLogin,
  getAssignedComplaints,
  verifyAndSolveComplaint,
  updateComplaintStatus,
  uploadOperatorEvidence,
  getOperatorStats,
  cloudinaryHealth
} = require('../controllers/operatorController');

const router = express.Router();

router.post('/login', operatorLogin);
router.post('/complaints', authMiddleware, getAssignedComplaints);
router.post('/verify-resolution', authMiddleware, verifyAndSolveComplaint);
router.patch('/status', authMiddleware, updateComplaintStatus);
router.post('/upload-evidence', authMiddleware, upload.single('evidence'), uploadOperatorEvidence);
router.get('/stats', authMiddleware, getOperatorStats);
router.get('/cloudinary-health', authMiddleware, cloudinaryHealth);
module.exports = router;
