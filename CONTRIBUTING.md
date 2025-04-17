# Contributing to Band Permutation Test

Thank you for your interest in contributing to the Band Permutation Test project! This document provides guidelines and instructions for contributing.

## Code of Conduct

Please be respectful and considerate of others. By participating in this project, you agree to abide by basic open source etiquette.

## How to Contribute

### Reporting Issues

If you encounter any bugs or have feature requests:

1. Check if the issue already exists in the [Issues](https://github.com/x052/CPE-Pro-Band-Permutation/issues) section.
2. If it doesn't exist, create a new issue with:
   - A clear title
   - A detailed description
   - Steps to reproduce (for bugs)
   - Expected vs. actual behavior (for bugs)
   - Your environment details (OS, Node.js version, router model/firmware)

### Pull Requests

1. Fork the repository
2. Create a new branch for your feature or bug fix: `git checkout -b feature/your-feature-name` or `git checkout -b fix/issue-description`
3. Make your changes
4. Ensure your code follows the project's coding style
5. Run tests if available
6. Commit your changes with clear, descriptive commit messages
7. Push your branch to your fork
8. Submit a pull request to the main repository's `main` branch

### Development Setup

To set up the project locally:

1. Clone the repository:
   ```bash
   git clone https://github.com/x052/CPE-Pro-Band-Permutation.git
   cd CPE-Pro-Band-Permutation
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the project:
   ```bash
   npm run build
   ```

## Project Structure

- `band-permutation-test.ts` - Main application file
- `monitoringScript.js` - Script for interacting with the router
- `dist/` - Compiled JavaScript files (generated)
- `results/` - Output directory for test results
- `package.json` - Project metadata and dependencies
- `tsconfig.json` - TypeScript configuration

## Testing

Before submitting a pull request, please ensure your changes:

1. Do not break existing functionality
2. Are compatible with the Huawei 5G CPE Pro router (H112-370)
3. Follow the established code style

## License

By contributing to this project, you agree that your contributions will be licensed under the project's [MIT License](LICENSE).

## Questions?

If you have any questions, feel free to open an issue with the "question" label. 