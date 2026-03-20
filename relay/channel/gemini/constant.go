package gemini

var ModelList = []string{
	// gemini 2.5 stable
	"gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite",
	// gemini 2.5 image/audio/tts
	"gemini-2.5-flash-image",
	"gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts",
	"gemini-2.5-flash-native-audio-latest",
	// gemini 3.x series (2026)
	"gemini-3-flash-preview", "gemini-3-pro-preview", "gemini-3-pro-image-preview",
	"gemini-3.1-pro-preview", "gemini-3.1-pro-preview-customtools",
	"gemini-3.1-flash-lite-preview", "gemini-3.1-flash-image-preview",
	// alias latest
	"gemini-flash-latest", "gemini-flash-lite-latest", "gemini-pro-latest",
	// deep research / computer use
	"deep-research-pro-preview-12-2025",
	"gemini-2.5-computer-use-preview-10-2025",
	// imagen 4.x
	"imagen-4.0-generate-001", "imagen-4.0-ultra-generate-001", "imagen-4.0-fast-generate-001",
	// veo video
	"veo-2.0-generate-001", "veo-3.0-generate-001", "veo-3.0-fast-generate-001",
	// gemma open models
	"gemma-3-1b-it", "gemma-3-4b-it", "gemma-3-12b-it", "gemma-3-27b-it",
	"gemma-3n-e4b-it", "gemma-3n-e2b-it",
	// embedding models
	"gemini-embedding-001", "gemini-embedding-2-preview",
}

var SafetySettingList = []string{
	"HARM_CATEGORY_HARASSMENT",
	"HARM_CATEGORY_HATE_SPEECH",
	"HARM_CATEGORY_SEXUALLY_EXPLICIT",
	"HARM_CATEGORY_DANGEROUS_CONTENT",
	//"HARM_CATEGORY_CIVIC_INTEGRITY", This item is deprecated!
}

var ChannelName = "google gemini"
