const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function getBase64FromUrl(url) {
  try {
    const axios = require('axios');
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const base64 = Buffer.from(response.data).toString('base64');
    return base64;
  } catch (error) {
    console.error('Error fetching image:', error.message);
    return null;
  }
}

async function compareImages(imageUrl1, imageUrl2) {
  try {
    console.log('🔍 Comparing images...');
    console.log('Image 1:', imageUrl1);
    console.log('Image 2:', imageUrl2);

    const model = await genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const base64Img1 = await getBase64FromUrl(imageUrl1);
    const base64Img2 = await getBase64FromUrl(imageUrl2);

    if (!base64Img1 || !base64Img2) {
      return {
        match: false,
        confidence: 0,
        explanation: 'Failed to fetch one or both images'
      };
    }

    const prompt = `Compare these two images of civic issues (like potholes, garbage, broken streetlights, etc.).

Image 1: The ORIGINAL complaint photo showing the issue
Image 2: The VERIFICATION photo showing the resolved issue

Analyze:
1. Are these images showing the SAME LOCATION?
2. Is the issue from Image 1 RESOLVED in Image 2?
3. What's the visual similarity percentage (0-100)?

Return ONLY a JSON object in this exact format:
{"match": true/false, "confidence": 0-100, "explanation": "brief explanation in 1-2 sentences"}

- Set "match" to true ONLY if both images show the same location AND the issue is resolved
- Set "confidence" to a number between 0-100 representing how confident you are
- "explanation" should be a brief explanation of your decision`;

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: 'image/jpeg',
          data: base64Img1
        }
      },
      {
        inlineData: {
          mimeType: 'image/jpeg',
          data: base64Img2
        }
      },
      prompt
    ]);

    const responseText = result.response.text();
    console.log('📊 Gemini response:', responseText);

    let parsedResult;
    try {
      parsedResult = JSON.parse(responseText);
    } catch (parseError) {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResult = JSON.parse(jsonMatch[0]);
      } else {
        return {
          match: false,
          confidence: 50,
          explanation: 'Unable to parse Gemini response. Please try again.'
        };
      }
    }

    return {
      match: parsedResult.match || false,
      confidence: parsedResult.confidence || 0,
      explanation: parsedResult.explanation || 'No explanation provided'
    };

  } catch (error) {
    console.error('❌ Image comparison error:', error.message);
    return {
      match: false,
      confidence: 0,
      explanation: `Error: ${error.message}`
    };
  }
}

module.exports = { compareImages };