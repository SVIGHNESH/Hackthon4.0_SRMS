# Samadhanam - Unified Civic Issue Management System

## Table of Contents

1. [Project Overview](#project-overview)
2. [System Architecture](#system-architecture)
3. [Database Models](#database-models)
4. [API Endpoints](#api-endpoints)
5. [Authentication](#authentication)
6. [AI Integration](#ai-integration)
7. [Setup & Installation](#setup--installation)
8. [Environment Variables](#environment-variables)
9. [Tech Stack](#tech-stack)

---

## Project Overview

Samadhanam (meaning "Solution" in Hindi) is a unified civic issue management system that bridges citizens, municipal authorities, and state governments. The platform enables citizens to report civic issues via a mobile app, allows municipal operators to resolve them with photo evidence, and provides state administrators with comprehensive analytics and oversight.

### Key Features

- **Citizen Portal**: Report civic issues with photos, track status, earn reward points
- **Municipal Operator Dashboard**: View assigned complaints, upload resolution evidence
- **State Admin Panel**: Monitor all districts, view statistics, manage municipalities
- **AI-Powered Verification**: Gemini Vision AI verifies complaint resolution through image comparison
- **Leaderboard System**: Gamification to encourage municipal performance

---

## System Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Flutter App  │────▶│   Express API   │────▶│    MongoDB      │
│   (Citizen)    │     │   (Port 4000)   │     │   Database      │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
             ┌──────────┐  ┌──────────┐  ┌──────────┐
             │  Users   │  │ Operators│  │  Admin   │
             │ Routes   │  │ Routes   │  │ Routes   │
             └──────────┘  └──────────┘  └──────────┘
                    │            │            │
                    ▼            ▼            ▼
             ┌──────────┐  ┌──────────┐  ┌──────────┐
             │  Cloudinary  │  │ Gemini AI│  │ Municipal│
             │ (Images)    │  │(Vision)  │  │   Data   │
             └──────────┘  └──────────┘  └──────────┘
```

### Flow of Operations

1. **Citizen** submits complaint with photo → stored in MongoDB, image in Cloudinary
2. **Operator** receives complaint → uploads resolution photo → AI verifies
3. **Admin** monitors all operations → views statistics and leaderboard

---

## Database Models

### 1. User Model (`User.js`)
```javascript
{
  imei_id: String (unique, required),    // Device IMEI for identification
  rewardPoints: Number (default: 0),     // Gamification points
  complaints: [ObjectId]                  // References to complaints
}
```

### 2. Complaint Model (`Complaint.js`)
```javascript
{
  title: String (required),
  location: String (required),
  latitude: Number (required),
  longitude: Number (required),
  status: String (enum: ["Pending", "In Progress", "Solved", "Rejected"]),
  description: String (required),
  imageUrl: String (required),            // User uploaded image
  operatorImageUrl: String,              // Resolution image from operator
  geminiVerified: Boolean,              // AI verification status
  user_imei: String (required),
  municipality_id: ObjectId (ref: 'municipality_new'),
  type: String,                          // Category (Potholes, Garbage, etc.)
  timeline: [Date],                      // Status change history
  evidenceUrl: String                   // Additional evidence
}
```

### 3. Municipal Model (`Municipal.js`)
```javascript
{
  district_id: Number (required),
  district_name: String (required),
  state_name: String (required),
  state_id: Number (required),
  official_username: String (required),
  hashed_password: String (required),
  complaints: [String],
  solved: Number (required),
  demerits: Number (required),
  pending: Number (required)
}
```

### 4. Operator Model (`Operator.js`)
```javascript
{
  official_username: String (unique, required),
  hashed_password: String (required),
  municipality_id: ObjectId (ref: 'municipality_new'),
  district_name: String (required)
}
```

### 5. State Model (`State.js`)
```javascript
{
  state_id: Number (required),
  state_name: String (required),
  official_username: String (required),
  hashed_password: String (required),
  complaints: [String],
  solved: Number (required),
  pending: Number (required)
}
```

---

## API Endpoints

### Base URL: `http://localhost:4000/api`

---

### USER ROUTES (`/api/users`)

#### 1. User Login
- **Endpoint**: `POST /api/users/login`
- **Description**: Login/register user via IMEI ID
- **Request Body**:
  ```json
  {
    "imei_id": "123456789012345"
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "user": {
      "_id": "...",
      "imei_id": "123456789012345",
      "rewardPoints": 0,
      "complaints": []
    }
  }
  ```

#### 2. Get Dashboard Stats
- **Endpoint**: `GET /api/users/dashboard`
- **Description**: Get overall complaint statistics
- **Response**:
  ```json
  {
    "success": true,
    "stats": {
      "totalPending": 150,
      "totalSolved": 450
    }
  }
  ```

#### 3. Get Leaderboard
- **Endpoint**: `GET /api/users/leaderboard`
- **Description**: Get municipal performance rankings
- **Response**:
  ```json
  {
    "success": true,
    "leaderboard": [
      { "district": "Bareilly", "ratio": "85.50", "solved": 85, "total": 100 },
      { "district": "Agra", "ratio": "72.00", "solved": 72, "total": 100 }
    ]
  }
  ```

#### 4. Submit Complaint
- **Endpoint**: `POST /api/users/complaint`
- **Description**: Submit a new civic complaint
- **Request Body**:
  ```json
  {
    "title": "Pothole on Main Road",
    "location": "MG Road, Bareilly",
    "latitude": 28.3670,
    "longitude": 79.4304,
    "description": "Large pothole causing traffic",
    "user_imei": "123456789012345",
    "municipality_id": "...",
    "type": "Potholes"
  }
  ```

#### 5. Submit Complaint with Image
- **Endpoint**: `POST /api/users/complaint/with-image`
- **Description**: Submit complaint with image upload
- **Content-Type**: `multipart/form-data`
- **Form Data**:
  - `image`: Image file
  - `title`: String
  - `location`: String
  - `latitude`: Number
  - `longitude`: Number
  - `description`: String
  - `user_imei`: String
  - `municipality_id`: String
  - `type`: String

#### 6. Get User Complaints
- **Endpoint**: `GET /api/users/my-complaints?imei_id=...`
- **Description**: Get all complaints submitted by user
- **Query Params**: `imei_id` (required)

#### 7. Get Complaint Categories
- **Endpoint**: `GET /api/users/categories`
- **Description**: Get available complaint categories

---

### OPERATOR ROUTES (`/api/operator`)

#### 1. Operator Login
- **Endpoint**: `POST /api/operator/login`
- **Description**: Authenticate municipal operator
- **Request Body**:
  ```json
  {
    "username": "operator_bareilly",
    "password": "securepassword"
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "operator": { ... },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
  ```

#### 2. Get Assigned Complaints
- **Endpoint**: `POST /api/operator/complaints`
- **Description**: Get complaints assigned to operator's municipality
- **Request Body**:
  ```json
  {
    "municipality_id": "..."
  }
  ```

#### 3. Verify and Solve Complaint (AI)
- **Endpoint**: `POST /api/operator/verify-resolution`
- **Description**: Verify resolution by comparing complaint image and operator evidence image (uploaded directly to Cloudinary from frontend)
- **Request Body**:
  ```json
  {
    "complaint_id": "...",
    "operator_image_url": "https://res.cloudinary.com/..."
  }
  ```
- **Verification Rules**:
  - Complaint is marked `Solved` only when AI returns `is_solved: true` and similarity score is `>= 70`
  - Similarity score is derived from Gemini confidence (`0-100`)
  - If AI is unavailable/invalid, verification fails safely (complaint is not solved)
  - Operator evidence URL is still stored for audit and retry
- **Success Response (example)**:
  ```json
  {
    "success": true,
    "verified": true,
    "similarity": 84,
    "threshold": 70,
    "message": "Issue verified and resolved successfully!",
    "reason": "Same location and issue appears resolved",
    "complaint": { "_id": "...", "status": "Solved" }
  }
  ```
- **Failure Response (example)**:
  ```json
  {
    "success": false,
    "verified": false,
    "similarity": 52,
    "threshold": 70,
    "message": "Low similarity (52%). Please provide clearer verification photo.",
    "reason": "Location appears similar but issue is not clearly resolved",
    "complaintId": "..."
  }
  ```

#### 4. Update Complaint Status
- **Endpoint**: `PATCH /api/operator/status`
- **Description**: Manually update complaint status
- **Request Body**:
  ```json
  {
    "complaint_id": "...",
    "status": "In Progress"
  }
  ```

#### 5. Upload Evidence
- **Endpoint**: `POST /api/operator/upload-evidence`
- **Description**: Upload resolution evidence image
- **Content-Type**: `multipart/form-data`
- **Form Data**:
  - `evidence`: Image file
  - `complaintId`: String

---

### ADMIN ROUTES (`/api/admin`)

#### State Endpoints

##### 1. State Login
- **Endpoint**: `POST /api/admin/state/login`
- **Request Body**:
  ```json
  {
    "enteredUserName": "state_up",
    "enteredPassword": "password"
  }
  ```

##### 2. Get All Districts
- **Endpoint**: `POST /api/admin/state/allDistricts`
- **Request Body**:
  ```json
  {
    "id": 1
  }
  ```

##### 3. Get All Districts (Public)
- **Endpoint**: `GET /api/admin/state/allDistricts`
- **Description**: Get all districts without authentication

##### 4. Get District by ID
- **Endpoint**: `POST /api/admin/state/fetchDistrict`
- **Request Body**:
  ```json
  {
    "id": 101
  }
  ```

##### 5. Get State Stats
- **Endpoint**: `GET /api/admin/state/stats?state_id=...`
- **Description**: Get aggregated statistics for a state

#### Municipal Endpoints

##### 1. Municipal Login
- **Endpoint**: `POST /api/admin/municipal/login`
- **Request Body**:
  ```json
  {
    "username": "municipal_bareilly",
    "password": "password"
  }
  ```

##### 2. Get All Municipal Districts
- **Endpoint**: `POST /api/admin/municipal/allDistricts`
- **Description**: Get all municipalities

##### 3. Get District by ID (Municipal)
- **Endpoint**: `POST /api/admin/municipal/fetchDistrict`
- **Request Body**:
  ```json
  {
    "id": 101
  }
  ```

##### 4. Get Complaints by Municipality
- **Endpoint**: `POST /api/admin/municipal/fetchByName`
- **Request Body**:
  ```json
  {
    "municipalityName": "Bareilly"
  }
  ```

#### Complaint Endpoints

##### 1. Update Complaint Status
- **Endpoint**: `PATCH /api/admin/complaint/update`
- **Request Body**:
  ```json
  {
    "complaintId": "...",
    "status": "solved",
    "assignedTo": "Operator Name"
  }
  ```

##### 2. Get Complaint by ID
- **Endpoint**: `GET /api/admin/complaint/:id`

##### 3. Upload Evidence
- **Endpoint**: `POST /api/admin/complaint/uploadEvidence`
- **Content-Type**: `multipart/form-data`
- **Form Data**:
  - `evidence`: Image file
  - `complaintId`: String

##### 4. Filter Complaints
- **Endpoint**: `POST /api/admin/complaint/filter`
- **Request Body**:
  ```json
  {
    "municipalityName": "Bareilly",
    "status": "pending",
    "category": "Potholes",
    "page": 1,
    "limit": 10
  }
  ```

#### Categories Endpoint

##### 1. Get Categories
- **Endpoint**: `GET /api/admin/categories`
- **Description**: Get available complaint categories

---

## Authentication

### JWT Token Structure

The system uses JSON Web Tokens (JWT) for authentication:

```javascript
// User Token
{
  "id": "user_id",
  "imei_id": "123456789012345"
}

// Operator Token
{
  "id": "operator_id",
  "official_username": "operator_bareilly"
}

// Admin Token
{
  "id": "state_id",
  "state_id": 1
}
```

### Password Security
- All passwords are hashed using **bcrypt** with salt rounds
- Passwords are never stored in plain text

---

## AI Integration

### Gemini Vision AI for Resolution Verification

The system uses Google Gemini 1.5 Flash model for AI-powered image comparison:

```
┌─────────────────┐      ┌─────────────────┐
│  User Complaint │      │  Operator       │
│     Image       │      │  Resolution     │
└────────┬────────┘      └────────┬────────┘
         │                        │
         └────────┬───────────────┘
                  ▼
         ┌─────────────────┐
         │  Gemini Vision  │
         │      AI         │
         └────────┬────────┘
                  ▼
         ┌─────────────────┐
         │  JSON Response  │
         │ {is_solved,     │
         │  reason}        │
         └─────────────────┘
```

### Prompt Used
```
Image 1 is a civic complaint reported by a citizen. 
Image 2 is the resolution photo uploaded by the municipality operator. 
Analyze both carefully. Has the issue shown in Image 1 been 
successfully fixed in Image 2? 
Respond ONLY with a JSON object: { "is_solved": true/false, "reason": "brief explanation" }
```

---

## Setup & Installation

### Prerequisites
- Node.js (v18+)
- MongoDB (local or Atlas)
- Cloudinary account
- Google Gemini API key

### Installation Steps

1. **Clone and Navigate**:
   ```bash
   cd unified-civic-backend
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment**:
   Edit `.env` file with your credentials

4. **Start Server**:
   ```bash
   # Development
   npm run dev
   
   # Production
   npm start
   ```

---

## Environment Variables

Create a `.env` file in the root directory:

```env
PORT=4000
MONGODBURL=your_mongodb_connection_string
JWT_SECRET=your_super_secret_key

# Cloudinary
CLOUD_NAME=your_cloudinary_name
CLOUDINARY_API_KEY=your_cloudinary_key
CLOUDINARY_SECRET_KEY=your_cloudinary_secret

# AI
GEMINI_API_KEY=your_gemini_api_key
```

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Backend | Node.js, Express.js |
| Database | MongoDB, Mongoose |
| Authentication | JWT, bcrypt |
| File Storage | Cloudinary |
| AI | Google Gemini 1.5 Flash |
| Mobile App | Flutter |
| Development | nodemon |

---

## Complaint Status Flow

```
┌─────────────┐
│   Pending   │◀── Initial state when citizen submits
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ In Progress │◀── Operator starts working on complaint
└──────┬──────┘
       │
       ▼
┌─────────────┐
│    Solved   │◀── AI verified or manual verification
└─────────────┘
```

---

## Leaderboard Calculation

```javascript
ratio = (solved / total) * 100

Example:
- Bareilly: solved=85, pending=15, total=100
  ratio = (85 / 100) * 100 = 85.00%
  
- Agra: solved=60, pending=40, total=100
  ratio = (60 / 100) * 100 = 60.00%

// Sorted by ratio descending
```

---

## Error Response Format

All API errors follow this format:

```json
{
  "success": false,
  "message": "Error description here"
}
```

### Common Status Codes
- `200` - Success
- `400` - Bad Request
- `401` - Unauthorized
- `404` - Not Found
- `500` - Server Error

---

## File Structure

```
unified-civic-backend/
├── config/
│   ├── cloudinary.js      # Cloudinary configuration
│   └── mongodb.js         # MongoDB connection
├── controllers/
│   ├── adminController.js # State & Municipal operations
│   ├── operatorController.js # Operator actions + AI
│   └── userController.js  # Citizen operations
├── models/
│   ├── Complaint.js       # Complaint schema
│   ├── Municipal.js      # Municipal schema
│   ├── Operator.js      # Operator schema
│   ├── State.js         # State schema
│   └── User.js          # User schema
├── routes/
│   ├── adminRoutes.js    # Admin API routes
│   ├── operatorRoutes.js # Operator API routes
│   └── userRoutes.js     # User API routes
├── .env                 # Environment variables
├── package.json         # Dependencies
└── server.js           # Application entry point
```

---

## Complete API Endpoint Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| **USER ROUTES** | | |
| POST | `/api/users/login` | Login/register via IMEI |
| GET | `/api/users/dashboard` | Get dashboard stats |
| GET | `/api/users/leaderboard` | Get municipal rankings |
| POST | `/api/users/complaint` | Submit complaint |
| POST | `/api/users/complaint/with-image` | Submit with image |
| GET | `/api/users/my-complaints` | Get user's complaints |
| GET | `/api/users/categories` | Get complaint categories |
| **OPERATOR ROUTES** | | |
| POST | `/api/operator/login` | Operator login |
| POST | `/api/operator/complaints` | Get assigned complaints |
| POST | `/api/operator/verify-resolution` | AI verify resolution (70% threshold) |
| PATCH | `/api/operator/status` | Update complaint status |
| POST | `/api/operator/upload-evidence` | Upload resolution image |
| **ADMIN ROUTES - STATE** | | |
| POST | `/api/admin/state/login` | State login |
| POST | `/api/admin/state/allDistricts` | Get districts by state |
| GET | `/api/admin/state/allDistricts` | Get all districts (public) |
| POST | `/api/admin/state/fetchDistrict` | Get district by ID |
| GET | `/api/admin/state/stats` | Get state statistics |
| **ADMIN ROUTES - MUNICIPAL** | | |
| POST | `/api/admin/municipal/login` | Municipal login |
| POST | `/api/admin/municipal/allDistricts` | Get all municipalities |
| POST | `/api/admin/municipal/fetchDistrict` | Get municipality by ID |
| POST | `/api/admin/municipal/fetchByName` | Get complaints by name |
| **ADMIN ROUTES - COMPLAINT** | | |
| PATCH | `/api/admin/complaint/update` | Update complaint status |
| GET | `/api/admin/complaint/:id` | Get complaint by ID |
| POST | `/api/admin/complaint/uploadEvidence` | Upload evidence |
| POST | `/api/admin/complaint/filter` | Filter complaints |
| **ADMIN ROUTES - OTHER** | | |
| GET | `/api/admin/categories` | Get categories |

---

## Support & Maintenance

For issues or questions:
1. Check API response messages for error details
2. Verify MongoDB connection
3. Confirm Cloudinary credentials
4. Check Gemini API key validity

---

*Documentation Version: 1.0*  
*Last Updated: April 2026*
