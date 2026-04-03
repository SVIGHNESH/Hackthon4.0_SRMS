const express = require('express');
const multer = require('multer');
const upload = multer({ memoryStorage: true });
const { 
    operatorLogin, 
    getAssignedComplaints, 
    verifyAndSolveComplaint, 
    updateComplaintStatus,
    uploadOperatorEvidence 
} = require('../controllers/operatorController');

const router = express.Router();

router.post('/login', operatorLogin);
router.post('/complaints', getAssignedComplaints);
router.post('/verify-resolution', verifyAndSolveComplaint);
router.patch('/status', updateComplaintStatus);
router.post('/upload-evidence', upload.single('evidence'), uploadOperatorEvidence);

module.exports = router;