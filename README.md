# Web-Based Authentication and Authorization for NGINX

A small nodejs + expressjs application that enables authentication and authorization for NGINX using the
[ngx_http_auth_request_module](http://nginx.org/en/docs/http/ngx_http_auth_request_module.html) module.

## Installation

### 1. Install system dependencies

NGINX must be compiled with ngx_http_auth_request_module, and optionally the sub module.  Both are included
by default in [NGINX's Repository](http://nginx.org/en/linux_packages.html).  The node.js packages are
found in the [EPEL repository](https://fedoraproject.org/wiki/EPEL) for Redhat-based systems:

    sudo yum install nginx nodejs npm

### 2. Create an unpriveleged user

    useradd --shell /sbin/nologin -m nginx-auth

### 3. Clone the nginx-auth repository

    sudo su - # Unless non-root users have access to the home directory.
    cd /home/nginx-auth
    sudo -u nginx-auth -H git clone https://github.com/justinjahn/nginx-auth.git

### 4. Installing NPM Packages

    cd /home/nginx-auth/nginx-auth
    sudo -u nginx-auth -H npm install

### 4. Copy and edit the configuration file

    sudo -u nginx-auth -H cp config/default.json.dist config/default.json
    sudo -u nginx-auth -H vi config/default.json

### 5. Copy the nginx-auth systemd service file

    sudo cp share/nginx-auth.service /etc/systemd/system/nginx-auth.service

### 6. Enable and start the application

    sudo systemctl enable nginx-auth
    sydo systemctl start nginx-auth

### 7. Configuring NGINX

Configuring NGINX is outside the scope of this package, however the `test/nginx.conf.dist` file provides
an excellent starting point, including all of the necessary configuration to get nginx-auth set up to
authenticate a full website running alongside it.
