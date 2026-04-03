const express = require('express');
const multer = require('multer');
const upload = multer({ memoryStorage: true });
const { 
    stateLogin, 
    fetchAllDistricts, 
    fetchAllDistrictsPublic,
    fetchDistrictById,
    municipalLogin,
    fetchComplaintsByMunicipality,
    getComplaintCategories,
    getStateStats,
    updateComplaintStatus,
    getComplaintById,
    uploadEvidence,
    getComplaintsWithFilters
} = require('../controllers/adminController');

const router = express.Router();

router.post('/state/login', stateLogin);
router.post('/state/allDistricts', fetchAllDistricts);
router.get('/state/allDistricts', fetchAllDistrictsPublic);
router.post('/state/fetchDistrict', fetchDistrictById);
router.get('/state/stats', getStateStats);

router.post('/municipal/login', municipalLogin);
router.post('/municipal/allDistricts', fetchAllDistrictsPublic);
router.post('/municipal/fetchDistrict', fetchDistrictById);
router.post('/municipal/fetchByName', fetchComplaintsByMunicipality);

router.get('/categories', getComplaintCategories);

router.patch('/complaint/update', updateComplaintStatus);
router.get('/complaint/:id', getComplaintById);
router.post('/complaint/uploadEvidence', upload.single('evidence'), uploadEvidence);
router.post('/complaint/filter', getComplaintsWithFilters);

module.exports = router;