# CVantage

This project contains 
- `PROMPT.md` file which contains the application requirements.
- `cvantage-mockup.html` file which contains static UI markup generated based on `PROMPT.md` file.
- `database/nestjs-mongoose/schemas.ts` which contains sample mongoose schema generated based on `PROMPT.md`

You are an expert software architect and legendary software engineer.
You are tasked with implementing the CVantage Project end to end.
The project should be implemented in a way that is scalable which means,
- All the features should be configurable.
- Easier to extend existing functionality.
- Easier to add new functionality.
- Scalable architecture.

### Server
- Scaffold a NestJS project.
- Use MongoDB and Mongoose for data layer.
- Refer to `database/nestjs-mongoose/schemas.ts` for database schema.
- Follow modular architecture.
- Write modular, highly testable and high quality code.
- Implement Separation of concerns.
- Application secrets to be read from `.env` file.
- API Global prefix should be `/api/v1`
- Refer to `PROMPT.md` to learn about application features.
- Use `langchain`, `langchain-openai` for LLM communication.
- Use `zod` for schema validation.
- Use langchain pdf loader to extract text from pdf.
- Use mammoth to extract text from doc/docx files.

### Client
- Scaffold a react+typescript+vite project in `frontend` folder.
- The file `cvantage-mockup.html` is to be referred to to understand the look and feel of the application.
- The file `PROMPT.md` is to be referred to to understand application requirements.
- Write modular and hightly testable and high quality code.
- Use tanstack query.
- Use tailwind

### Client - Server communication
- The server should serve the react application build in `frontend/dist` folder.
- This is a SPA so handle 404 errors correctly.
- Use appropriate routing.

### General build guideline
- Implement precommit hooks that lint, lint fix and unit test both client and server.
- Commit message validation
- Use the Yarn package manager (