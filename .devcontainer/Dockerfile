# .devcontainer/Dockerfile
FROM mcr.microsoft.com/vscode/devcontainers/typescript-node

# Switch to the node user
USER node

# Install Angular CLI
# Enable CLI Autocomplete
RUN npm install -g @angular/cli
ARG USERNAME=node
RUN SOURCE="source <(ng completion script)" \
    && echo "$SOURCE" >> "/home/$USERNAME/.bashrc"