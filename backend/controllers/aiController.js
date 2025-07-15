const Course = require("../models/Course");
const { HfInference } = require("@huggingface/inference");
require("dotenv").config();

console.log("HF_ACCESS_TOKEN available:", !!process.env.HF_ACCESS_TOKEN);

let hf;
try {
  hf = new HfInference(process.env.HF_ACCESS_TOKEN);
  console.log("Hugging Face client initialized successfully");
} catch (error) {
  console.error("Error initializing Hugging Face client:", error);
}

const generateText = async (prompt) => {
  try {
    if (!hf) {
      throw new Error("Hugging Face client not properly initialized");
    }

    // Use educational context for better Q&A responses
    const context = `Course creation involves developing educational content, learning objectives, assessments, and structured lessons. Effective courses should be engaging, well-organized, and provide clear learning outcomes. Topics can include programming, business, science, arts, and various professional skills.`;

    try {
      const response = await hf.questionAnswering({
        model: 'deepset/roberta-base-squad2',
        inputs: {
          question: prompt,
          context: context
        }
      });

      return response.answer; // Return just the text, not the object
    } catch (qaError) {
      console.log('Question answering failed, trying feature extraction approach:', qaError.message);
      
      // Fallback: Use feature extraction to analyze the prompt
      const embedding = await hf.featureExtraction({
        model: 'sentence-transformers/all-MiniLM-L6-v2',
        inputs: prompt
      });

      // Generate a mock response based on the prompt analysis
      const mockResponse = generateMockContent(prompt);
      
      return mockResponse; // Return just the text
    }
  } catch (error) {
    console.error("Error generating text:", error);
    console.log("Using fallback response due to API error");
    
    // Return a meaningful fallback response
    return generateMockContent(prompt);
  }
};

// Helper function to generate mock content when AI fails
const generateMockContent = (prompt) => {
  const promptLower = prompt.toLowerCase();
  
  if (promptLower.includes('lesson') || promptLower.includes('content')) {
    return `Title: ${extractTopicFromPrompt(prompt)}
    
Description: This comprehensive lesson covers the essential concepts and practical applications.

Learning Outcomes:
- Understand the fundamental principles
- Apply concepts to real-world scenarios
- Develop practical skills and competencies

Key Concepts:
- Core foundations and terminology
- Best practices and methodologies
- Modern approaches and techniques

Activities:
- Interactive exercises and practice sessions
- Hands-on projects and implementations
- Assessment and evaluation components`;
  }
  
  if (promptLower.includes('course structure') || promptLower.includes('outline')) {
    const topic = extractTopicFromPrompt(prompt);
    return `Course Structure for ${topic}:

Module 1: Introduction and Fundamentals
- Overview and basic concepts
- Historical context and evolution
- Key terminology and definitions

Module 2: Core Principles and Techniques
- Essential methodologies
- Practical applications
- Common patterns and approaches

Module 3: Advanced Topics and Implementation
- Complex scenarios and solutions
- Integration with other technologies
- Performance optimization

Module 4: Project and Assessment
- Capstone project development
- Peer review and collaboration
- Final assessment and certification`;
  }
  
  return `Generated content for: ${prompt}

This comprehensive guide covers all essential aspects with detailed explanations, practical examples, and hands-on exercises designed to enhance your understanding and skills.`;
};

// Helper function to extract topic from prompt
const extractTopicFromPrompt = (prompt) => {
  // Simple topic extraction - look for common patterns
  const aboutMatch = prompt.match(/about\s+([^.!?]+)/i);
  const forMatch = prompt.match(/for\s+([^.!?]+)/i);
  const topicMatch = prompt.match(/topic[:\s]+([^.!?]+)/i);
  
  if (aboutMatch) return aboutMatch[1].trim();
  if (forMatch) return forMatch[1].trim();
  if (topicMatch) return topicMatch[1].trim();
  
  // Fallback: take first few words
  const words = prompt.split(' ').slice(0, 3).join(' ');
  return words || 'Programming Concepts';
};

exports.generateLessonContent = async (req, res, next) => {
  try {
    const { topic, difficulty } = req.body;

    const prompt = `Generate a structured lesson about ${topic} at a ${difficulty} difficulty level. 
    Include the following sections: title, description, learning outcomes, key concepts, and activities.`;

    const generatedText = await generateText(prompt);

    let aiContent = {};

    try {
      const sections = generatedText.split("\n\n");

      aiContent = {
        title: sections[0] || `Introduction to ${topic}`,
        description: sections[1] || `This lesson covers the fundamentals of ${topic} at a ${difficulty} level.`,
        learningOutcomes: sections[2]?.split("\n").filter((item) => item.trim()) || [
          `Understand the basic concepts of ${topic}`,
          `Apply ${topic} principles to solve problems`,
        ],
        keyConcepts: sections[3]?.split("\n").filter((item) => item.trim()) || [`Core principles of ${topic}`, `${topic} best practices`],
        activities: sections[4]?.split("\n").filter((item) => item.trim()) || [
          `Interactive quiz on ${topic}`,
          `Hands-on project implementing ${topic}`,
        ],
      };
    } catch (parseError) {
      console.error("Error parsing AI response:", parseError);
      aiContent = {
        title: `Introduction to ${topic}`,
        description: `This lesson covers the fundamentals of ${topic} at a ${difficulty} level.`,
        learningOutcomes: [
          `Understand the basic concepts of ${topic}`,
          `Apply ${topic} principles to solve problems`,
          `Analyze and evaluate ${topic} implementations`,
        ],
        keyConcepts: [`Core principles of ${topic}`, `${topic} best practices`, `Modern approaches to ${topic}`],
        activities: [`Interactive quiz on ${topic}`, `Hands-on project implementing ${topic}`, `Group discussion about ${topic} applications`],
      };
    }

    res.status(200).json({
      success: true,
      data: aiContent,
    });
  } catch (error) {
    next(error);
  }
};

exports.enhanceContent = async (req, res, next) => {
  try {
    const course = await Course.findById(req.params.courseId);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: `Course not found with id of ${req.params.courseId}`,
      });
    }

    if (course.user.toString() !== req.user.id) {
      return res.status(401).json({
        success: false,
        message: `User ${req.user.id} is not authorized to enhance this course`,
      });
    }

    const moduleToEnhance = course.modules[0];
    const lessonToEnhance = moduleToEnhance?.lessons[0];

    if (!moduleToEnhance || !lessonToEnhance) {
      return res.status(400).json({
        success: false,
        message: "No content to enhance in this course",
      });
    }

    const prompt = `Analyze this lesson on "${lessonToEnhance.title}" with description "${lessonToEnhance.content}".
    Provide 3 specific improvements that could make this lesson more engaging and effective.
    Also suggest 2 additional resources (like articles or videos) that would complement this lesson.`;

    const generatedSuggestions = await generateText(prompt);

    res.status(200).json({
      success: true,
      message: "Content enhancement suggestions generated",
      data: {
        suggestions: [
          {
            moduleIndex: 0,
            lessonIndex: 0,
            suggestedImprovements: generatedSuggestions,
            rawAIResponse: generatedSuggestions,
          },
        ],
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.generateCourseStructure = async (req, res, next) => {
  try {
    const { topic, targetAudience, difficulty } = req.body;

    console.log("Received request to generate course structure:", {
      topic,
      targetAudience,
      difficulty,
    });

    const prompt = `Generate a complete course structure for a ${difficulty} level course about ${topic} designed for ${targetAudience}.
    The structure should include a course title, description, and 3-5 modules.
    For each module, include: title, description, prerequisites, difficulty level, estimated time in minutes, and 2-3 lessons with topics.`;

    const generatedText = await generateText(prompt);

    const courseStructure = {
      title: `Complete ${topic} Course for ${targetAudience}`,
      description: `Comprehensive course on ${topic} designed specifically for ${targetAudience} at ${difficulty} level.`,
      modules: [
        {
          title: `Introduction to ${topic}`,
          description: `Learn the fundamentals of ${topic}`,
          prerequisites: [],
          difficulty: difficulty,
          estimatedTime: 120,
          lessons: [
            {
              topic: `${topic} Basics`,
              order: 1,
            },
            {
              topic: `${topic} History and Evolution`,
              order: 2,
            },
          ],
          order: 1,
        },
        {
          title: `Advanced ${topic} Concepts`,
          description: `Deepen your understanding of ${topic}`,
          prerequisites: [`Introduction to ${topic}`],
          difficulty: difficulty,
          estimatedTime: 180,
          lessons: [
            {
              topic: `${topic} in Practice`,
              order: 1,
            },
            {
              topic: `${topic} Case Studies`,
              order: 2,
            },
          ],
          order: 2,
        },
      ],
      rawAIResponse: generatedText,
    };

    res.status(200).json({
      success: true,
      data: courseStructure,
    });
  } catch (error) {
    next(error);
  }
};
